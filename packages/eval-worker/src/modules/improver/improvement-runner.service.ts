import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import {
  narrationToProse,
  projectNarration,
  validateBriefReferences,
  validateGraphReferences,
  validateNarration,
  validateWorkflowReferences,
  type ImprovementIteration,
  type ImprovementStopReason,
} from '@sysdesign/contracts';
import { createRevisionRecords, DesignRevision, EvalJob, ImprovementRun } from '@sysdesign/db';
import { asRecordable, type LlmCall, type LlmClient } from '@sysdesign/llm';
import { GIT_CONTEXT, makeRunId, writeDump } from '@sysdesign/run-dump';

import { runEngine } from '../../engine/engine';
import type { EngineResult } from '../../engine/types';
import { promptFactsFrom } from '../shared/prompt-facts';
import { IMPROVER_LLM } from './llm.token';
import { proposeImprovement, type ImprovementCandidate } from './proposers/llm-proposer';

/** How many consecutive non-improving iterations end the run as a plateau. */
export const PLATEAU_AFTER = 3;

/** The design trio the loop carries between iterations. */
type Design = Pick<ImprovementCandidate, 'graph' | 'brief' | 'narrative'>;

/**
 * Executes one claimed improvement run: the productized version of the human
 * loop (read findings → fix → resubmit) with the deterministic engine as the
 * gate. A candidate is accepted only when its overallScore is STRICTLY higher
 * than the best so far — ties reject — so the persisted trajectory is
 * monotonically increasing by construction, whatever the model proposes.
 *
 * Every accepted candidate becomes a real origin='assistant' revision with a
 * queued Evaluation + EvalJob, graded by the NORMAL eval pipeline; under a
 * deterministic profile that grade equals the trajectory score. Rejected
 * candidates never touch the revisions table — they live only in the
 * trajectory (and the run dump).
 */
@Injectable()
export class ImprovementRunnerService {
  private readonly logger = new Logger(ImprovementRunnerService.name);

  constructor(
    private readonly em: EntityManager,
    @Inject(IMPROVER_LLM) private readonly llm: LlmClient,
  ) {}

  async run(runId: string): Promise<void> {
    const em = this.em.fork();
    const run = await em.findOneOrFail(
      ImprovementRun,
      { id: runId },
      { populate: ['session', 'session.prompt', 'baseRevision', 'bestRevision'] },
    );

    // The fencing token from the poller's claim. Every guarded write matches
    // on it, so if the reaper requeues this run (a hung LLM call outliving the
    // stale window) and a second worker reclaims it, this worker's writes
    // match zero rows instead of clobbering the new owner's trajectory.
    const fence = run.lockedBy;

    const llmCalls: LlmCall[] = [];
    const llm =
      asRecordable(this.llm)?.withRecorder((call) => {
        llmCalls.push(call);
      }) ?? this.llm;

    const trajectory: ImprovementIteration[] = [...run.iterations];
    try {
      if (run.attempts > run.maxAttempts) {
        await this.finalize(em, run.id, fence, trajectory, 'failed', null, 'too many attempts');
        return;
      }
      if (!this.llm.enabled) {
        await this.finalize(
          em,
          run.id,
          fence,
          trajectory,
          'failed',
          'llm-unavailable',
          'the improver has no live model — set ANTHROPIC_API_KEY or IMPROVER_AUTH=claude-code',
        );
        return;
      }

      const prompt = run.session.prompt;
      const facts = promptFactsFrom(prompt);
      const score = (design: Design): EngineResult =>
        runEngine(
          design.graph,
          facts,
          narrationToProse(design.narrative),
          design.brief,
          projectNarration(design.narrative, design.graph),
        );

      // Resume support: a reaped/requeued run continues from its last
      // accepted revision instead of re-proposing what it already accepted —
      // loaded by the trajectory's own id so the comparator's floor can never
      // drop below what the timeline already shows.
      const lastAccepted = [...trajectory].reverse().find((entry) => entry.accepted);
      let bestRevisionId = lastAccepted?.revisionId ?? run.baseRevision.id;
      const bestRevision =
        bestRevisionId === run.baseRevision.id
          ? run.baseRevision
          : await em.findOneOrFail(DesignRevision, { id: bestRevisionId });
      let best: Design = {
        graph: bestRevision.graph,
        brief: bestRevision.brief,
        narrative: bestRevision.narrative,
      };
      let bestResult = score(best);

      if (trajectory.length === 0) {
        trajectory.push({
          iteration: 0,
          proposer: 'baseline',
          description: 'The design as submitted.',
          score: bestResult.overallScore,
          accepted: true,
          revisionId: run.baseRevision.id,
        });
        await this.flushProgress(em, run.id, fence, trajectory, null);
      }

      if (bestResult.overallScore >= 100) {
        await this.finalize(em, run.id, fence, trajectory, 'completed', 'perfect');
        return;
      }
      if (!bestResult.findings.some((finding) => finding.severity !== 'info')) {
        await this.finalize(em, run.id, fence, trajectory, 'completed', 'already-clean');
        return;
      }

      const proposalsSoFar = trajectory.filter((entry) => entry.iteration > 0).length;
      let consecutiveRejects = 0;

      for (let proposals = proposalsSoFar; proposals < run.maxIterations; proposals++) {
        // A cancel (moved the run off 'running') or a reclaim (another worker
        // owns the lock now) wins; accepted work is kept, this worker stops.
        const current = await em
          .fork()
          .findOneOrFail(ImprovementRun, { id: run.id }, { fields: ['status', 'lockedBy'] });
        if (current.status !== 'running' || current.lockedBy !== fence) return;

        const iteration = trajectory[trajectory.length - 1].iteration + 1;
        const candidate = await proposeImprovement(llm, {
          graph: best.graph,
          brief: best.brief,
          narrative: best.narrative,
          facts,
          findings: bestResult.findings,
          overallScore: bestResult.overallScore,
        });

        if (!candidate) {
          consecutiveRejects++;
          trajectory.push({
            iteration,
            proposer: 'llm',
            description: 'The model returned no usable proposal.',
            score: bestResult.overallScore,
            accepted: false,
            revisionId: null,
            rejectedReason: 'no-proposal',
          });
        } else {
          // The graph is the foundation everything else references — an
          // invalid one is a hard reject. But an imperfect brief or narrative
          // (a flow whose hops do not join, say) must not sink an otherwise
          // good graph change: drop just that document and let the graph
          // improvement stand, scoring on its own merits. A later iteration
          // over the stabilized graph tends to produce a valid brief.
          const graphProblems = [
            ...validateGraphReferences(candidate.graph),
            ...validateWorkflowReferences(candidate.graph, facts.workflow),
          ];
          const briefOk =
            !candidate.brief ||
            validateBriefReferences(candidate.graph, candidate.brief, prompt).length === 0;
          const narrativeOk =
            !candidate.narrative ||
            validateNarration(candidate.graph, candidate.narrative, prompt).length === 0;
          const cleaned: ImprovementCandidate = {
            ...candidate,
            brief: briefOk ? candidate.brief : best.brief,
            narrative: narrativeOk ? candidate.narrative : best.narrative,
          };

          if (graphProblems.length > 0) {
            consecutiveRejects++;
            trajectory.push({
              iteration,
              proposer: 'llm',
              description: candidate.description,
              score: bestResult.overallScore,
              accepted: false,
              revisionId: null,
              rejectedReason: 'invalid',
            });
          } else {
            const result = score(cleaned);
            // THE monotonic gate: strictly better or it never persists.
            if (result.overallScore > bestResult.overallScore) {
              const revisionId = await this.persistAccepted(run, cleaned);
              best = cleaned;
              bestResult = result;
              bestRevisionId = revisionId;
              consecutiveRejects = 0;
              trajectory.push({
                iteration,
                proposer: 'llm',
                description: candidate.description,
                score: result.overallScore,
                accepted: true,
                revisionId,
              });
            } else {
              consecutiveRejects++;
              trajectory.push({
                iteration,
                proposer: 'llm',
                description: candidate.description,
                score: result.overallScore,
                accepted: false,
                revisionId: null,
                rejectedReason: 'not-better',
              });
            }
          }
        }

        await this.flushProgress(
          em,
          run.id,
          fence,
          trajectory,
          bestRevisionId === run.baseRevision.id ? null : bestRevisionId,
        );

        if (bestResult.overallScore >= 100) {
          await this.finalize(em, run.id, fence, trajectory, 'completed', 'perfect');
          return;
        }
        if (consecutiveRejects >= PLATEAU_AFTER) {
          await this.finalize(em, run.id, fence, trajectory, 'completed', 'plateau');
          return;
        }
      }

      await this.finalize(em, run.id, fence, trajectory, 'completed', 'max-iterations');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`improvement run ${runId} failed: ${message}`);
      const retryable = run.attempts < run.maxAttempts;
      // Guarded like every worker write: a cancel or reclaim that landed first
      // wins (status + fencing token), so this never revives a run another
      // worker now owns.
      await em.nativeUpdate(
        ImprovementRun,
        { id: run.id, status: 'running', lockedBy: fence },
        retryable
          ? { status: 'queued', error: message, lockedAt: null, lockedBy: null }
          : { status: 'failed', error: message, iterations: trajectory },
      );
    } finally {
      this.writeRunDump(run, trajectory, llmCalls);
    }
  }

  /**
   * One transaction per accepted candidate, retried when a concurrent user
   * submit wins the revision number — the same unique-constraint arbiter the
   * API's submit documents. The revision rides the NORMAL eval pipeline via
   * its own EvalJob row (the queue abstraction is an API seam; this worker
   * already owns the job table).
   */
  private async persistAccepted(
    run: ImprovementRun,
    candidate: ImprovementCandidate,
  ): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.em.fork().transactional(async (tem) => {
          const { revision } = await createRevisionRecords(
            tem,
            run.session.id,
            candidate,
            'assistant',
            async (txEm, rev) => {
              txEm.persist(txEm.create(EvalJob, { revision: rev }));
            },
          );
          return revision.id;
        });
      } catch (error) {
        if (error instanceof UniqueConstraintViolationException && attempt < 3) continue;
        throw error;
      }
    }
  }

  /**
   * Progress is one guarded row update — cheap enough to do every iteration.
   * It doubles as the heartbeat: `lockedAt` is refreshed so the reaper's
   * stale-lock window measures silence, not total run length — a
   * subscription-backed iteration can take minutes, and a healthy run must
   * never be requeued mid-flight while a crashed one still reaps on time.
   */
  private async flushProgress(
    em: EntityManager,
    runId: string,
    fence: string | null,
    trajectory: ImprovementIteration[],
    bestRevisionId: string | null,
  ): Promise<void> {
    await em.nativeUpdate(
      ImprovementRun,
      { id: runId, status: 'running', lockedBy: fence },
      {
        iterations: trajectory,
        ...(bestRevisionId ? { bestRevision: bestRevisionId } : {}),
        lockedAt: new Date(),
        updatedAt: new Date(),
      },
    );
  }

  private async finalize(
    em: EntityManager,
    runId: string,
    fence: string | null,
    trajectory: ImprovementIteration[],
    status: 'completed' | 'failed',
    stoppedReason: ImprovementStopReason | null,
    error: string | null = null,
  ): Promise<void> {
    await em.nativeUpdate(
      ImprovementRun,
      { id: runId, status: 'running', lockedBy: fence },
      {
        status,
        stoppedReason,
        error,
        iterations: trajectory,
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      },
    );
  }

  /**
   * Audit trail, eval-dump discipline: written in a finally, errors swallowed
   * — a dump must never cost a run its verdict. Rejected candidates' full
   * story (every LLM exchange) lives here, never in the revisions table.
   */
  private writeRunDump(
    run: ImprovementRun,
    trajectory: ImprovementIteration[],
    llmCalls: LlmCall[],
  ): void {
    try {
      const runId = makeRunId(Date.now(), 'improve');
      writeDump({
        runId,
        files: [
          {
            path: 'improve.json',
            content: JSON.stringify(
              {
                runId,
                improvementRunId: run.id,
                sessionId: run.session.id,
                baseRevisionId: run.baseRevision.id,
                maxIterations: run.maxIterations,
                model: this.llm.model,
                git: GIT_CONTEXT,
                trajectory,
                llmCalls,
              },
              null,
              2,
            ),
          },
        ],
        indexRow: `${JSON.stringify({
          runId,
          kind: 'improve',
          improvementRunId: run.id,
          sessionId: run.session.id,
          iterations: trajectory.length,
        })}\n`,
      });
    } catch (error) {
      this.logger.warn(
        `improve run dump for ${run.id} not written: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
