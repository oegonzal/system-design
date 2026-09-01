import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { DesignRevision, EvalJob, Evaluation, Finding } from '@sysdesign/db';
import { asRecordable, type LlmClient } from '@sysdesign/llm';

import { findPromptRunId, GIT_CONTEXT, makeRunId, writeDump } from '@sysdesign/run-dump';

import { buildEvalDump, startEvalDump, type EvalDump, type EvalDumpLlm } from '../../dump';
import { runEvaluation } from '../../engine/core/orchestrator';
import { createPassRegistry } from '../../engine/passes';
import { ACTIVE_PROFILE } from '../../engine/profiles';
import { ENGINE_VERSION } from '../../engine/scoring';
import type { PromptFacts } from '../../engine/types';
import { LLM_CLIENT } from './llm.token';

/** Exponential backoff: 10s, 20s, 40s… capped at 5 minutes. */
export const backoffMs = (attempts: number): number =>
  Math.min(10_000 * 2 ** Math.max(0, attempts - 1), 5 * 60_000);

/**
 * Executes one claimed job: engine → critic → persist. The engine alone
 * decides scores; critic findings are annotations (source='llm'), so an
 * unavailable model changes commentary, never the grade.
 */
@Injectable()
export class EvalRunnerService {
  private readonly logger = new Logger(EvalRunnerService.name);
  private readonly passRegistry = createPassRegistry();

  constructor(
    private readonly em: EntityManager,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  async run(jobId: string): Promise<void> {
    const em = this.em.fork();

    // If even the job row cannot load, leave it 'running' — the reaper will
    // requeue it once the lock goes stale. Nothing is dumped for that case:
    // there are no inputs yet to dump.
    const job = await em.findOneOrFail(EvalJob, jobId);

    const dump = startEvalDump({
      runId: makeRunId(Date.now(), 'eval'),
      jobId: job.id,
      now: Date.now(),
      llm: this.llmStatus(),
      git: GIT_CONTEXT,
    });
    // The no-op client cannot record, and does not need to: every LLM pass
    // returns before assembling a prompt when the model is off.
    const llm = asRecordable(this.llm)?.withRecorder(dump.record) ?? this.llm;

    let evaluation: Evaluation | null = null;
    try {
      const revision = await em.findOneOrFail(
        DesignRevision,
        { id: job.revision.id },
        { populate: ['session', 'session.prompt'] },
      );
      evaluation = await em.findOneOrFail(Evaluation, { revision: revision.id });

      // Visible state transition before the (possibly slow) critic call.
      await em.nativeUpdate(
        Evaluation,
        { id: evaluation.id },
        { status: 'running', startedAt: new Date(), error: null, updatedAt: new Date() },
      );

      const prompt = revision.session.prompt;
      const facts: PromptFacts = {
        archetype: prompt.archetype,
        difficulty: prompt.difficulty,
        scaleTargets: prompt.scaleTargets,
        nfrKinds: [...new Set(prompt.nonFunctionalRequirements.map((nfr) => nfr.kind))],
        nfrs: prompt.nonFunctionalRequirements.map((nfr) => ({
          id: nfr.id,
          kind: nfr.kind,
          statement: nfr.statement,
          target: nfr.target ?? null,
          targetSpec: nfr.targetSpec ?? null,
        })),
        functionalCapabilities: prompt.functionalCapabilities,
        functionalRequirementCount: prompt.functionalRequirements.length,
        functionalText: prompt.functionalRequirements.join(' ').toLowerCase(),
      };

      dump.inputs({
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        sessionId: revision.session.id,
        promptId: prompt.id,
        // Projected explicitly: `prompt` is a populated ORM entity, and its
        // relations are proxies that do not survive a stringify.
        prompt: {
          id: prompt.id,
          title: prompt.title,
          archetype: prompt.archetype,
          difficulty: prompt.difficulty,
          seed: prompt.seed,
          generatorVersion: prompt.generatorVersion,
          llmEnriched: prompt.llmEnriched,
          scenario: prompt.scenario,
          functionalRequirements: prompt.functionalRequirements,
          functionalCapabilities: prompt.functionalCapabilities,
          nonFunctionalRequirements: prompt.nonFunctionalRequirements,
          scaleTargets: prompt.scaleTargets,
        },
        graph: revision.graph,
        narrative: revision.narrative,
        brief: revision.brief,
        facts,
        profile: ACTIVE_PROFILE,
        engineVersion: ENGINE_VERSION,
      });

      const { result, artifacts } = await runEvaluation({
        graph: revision.graph,
        facts,
        narrative: revision.narrative,
        brief: revision.brief,
        llm,
        profile: ACTIVE_PROFILE,
        registry: this.passRegistry,
        recorder: dump.passes,
      });
      dump.outcome({ artifacts, result });
      const critique = result.annotations;

      const evaluationId = evaluation.id;
      await em.transactional(async (tem) => {
        // Retry path: replace, never append — one evaluation, one verdict.
        await tem.nativeDelete(Finding, { evaluation: evaluationId });

        for (const finding of result.findings) {
          tem.create(Finding, {
            evaluation: evaluationId,
            source: finding.expectationId ? 'expectation' : 'rule',
            ruleId: finding.ruleId,
            expectationId: finding.expectationId,
            nfrId: finding.nfrId,
            scenarioId: null,
            dimension: finding.dimension,
            severity: finding.severity,
            title: finding.title,
            message: finding.message,
            affectedNodeIds: finding.affectedNodeIds,
            affectedEdgeIds: finding.affectedEdgeIds,
            suggestion: finding.suggestion,
          });
        }
        for (const finding of critique?.findings ?? []) {
          tem.create(Finding, {
            evaluation: evaluationId,
            source: 'llm',
            ruleId: null,
            expectationId: null,
            nfrId: null,
            scenarioId: null,
            dimension: finding.dimension,
            severity: finding.severity,
            title: finding.title,
            message: finding.message,
            affectedNodeIds: finding.affectedNodeIds,
            affectedEdgeIds: [],
            suggestion: null,
          });
        }
        // Scenario failure stories persist as advisory findings too — same
        // llm source, so they teach without ever touching the score math.
        for (const report of result.scenarios?.reports ?? []) {
          if (report.verdict === 'survives') continue;
          tem.create(Finding, {
            evaluation: evaluationId,
            source: 'llm',
            ruleId: null,
            expectationId: null,
            nfrId: null,
            scenarioId: report.scenarioId,
            dimension: 'reliability',
            severity: report.verdict === 'fails' ? 'high' : 'medium',
            title: report.title,
            message: report.story,
            affectedNodeIds: report.weakestNodeIds,
            affectedEdgeIds: [],
            suggestion: null,
          });
        }

        await tem.nativeUpdate(
          Evaluation,
          { id: evaluationId },
          {
            status: 'complete',
            overallScore: result.overallScore,
            grade: result.grade,
            dimensionScores: result.dimensionScores,
            summary: critique?.summary ?? result.summary,
            engineVersion: ENGINE_VERSION,
            profileId: ACTIVE_PROFILE.id,
            profileVersion: ACTIVE_PROFILE.version,
            capApplied: result.capApplied,
            evidence: artifacts,
            axes: result.axes.map((axis) => ({
              id: axis.axisId,
              label: axis.label,
              score: axis.score,
              subScores: axis.subScores,
              summary: axis.summary,
              model: axis.model,
            })),
            scenarios: result.scenarios?.reports ?? [],
            criticModel: critique?.model ?? null,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        );
        await tem.nativeUpdate(
          EvalJob,
          { id: job.id },
          { status: 'completed', lastError: null, updatedAt: new Date() },
        );
      });

      dump.persisted({
        evaluationId: evaluationId,
        findingCount: result.findings.length,
      });

      this.logger.log(
        `evaluated revision ${job.revision.id}: ${result.grade} ${result.overallScore}`,
      );
    } catch (error) {
      dump.failed(error);
      await this.fail(em, job, evaluation, error);
    } finally {
      // A failed run is when the dump is most wanted, so it is written on both
      // paths — and after the transaction closes, so a slow fsync never holds a
      // Postgres transaction open.
      this.writeDump(dump);
    }
  }

  /**
   * Deliberately swallowing: this runs in a `finally`, so a throw here would
   * replace whatever error the run was already reporting and turn a retryable
   * failure into a crashed poll tick. An audit trail must never cost a grade.
   */
  private writeDump(dump: EvalDump): void {
    try {
      const promptId = dump.state.inputs?.promptId;
      const built = buildEvalDump(
        dump.state,
        Date.now(),
        promptId ? findPromptRunId(promptId) : null,
      );
      writeDump(built);
    } catch (error) {
      this.logger.warn(
        `run dump ${dump.state.runId} not written: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * What the dump may record about the model: derived facts only. The API key
   * is never captured — not its value, not its length, not a per-run boolean of
   * its presence.
   */
  private llmStatus(): EvalDumpLlm {
    const deterministic = process.env['EVAL_DETERMINISTIC'] === '1';
    return {
      enabled: this.llm.enabled,
      model: this.llm.model,
      reason: this.llm.enabled ? null : deterministic ? 'deterministic' : 'no-key',
    };
  }

  private async fail(
    em: EntityManager,
    job: EvalJob,
    evaluation: Evaluation | null,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = job.attempts < job.maxAttempts;
    this.logger.warn(`job ${job.id} attempt ${job.attempts}/${job.maxAttempts} failed: ${message}`);

    if (retryable) {
      await em.nativeUpdate(
        EvalJob,
        { id: job.id },
        {
          status: 'queued',
          runAfter: new Date(Date.now() + backoffMs(job.attempts)),
          lockedAt: null,
          lockedBy: null,
          lastError: message,
          updatedAt: new Date(),
        },
      );
      if (evaluation) {
        await em.nativeUpdate(
          Evaluation,
          { id: evaluation.id },
          { status: 'queued', error: message, updatedAt: new Date() },
        );
      }
      return;
    }

    await em.nativeUpdate(
      EvalJob,
      { id: job.id },
      { status: 'failed', lastError: message, updatedAt: new Date() },
    );
    if (evaluation) {
      await em.nativeUpdate(
        Evaluation,
        { id: evaluation.id },
        { status: 'failed', error: message, completedAt: new Date(), updatedAt: new Date() },
      );
    }
  }
}
