import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  DEFAULT_IMPROVE_ITERATIONS,
  designSubmissionSchema,
  MAX_IMPROVE_ITERATIONS,
  type ImproveIterationDto,
  type ImproveRunDto,
  type IterationTrace,
  type QualityRunStatus,
  type StartImproveDto,
  type StartImproveRequest,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import { DesignRevision } from '@sysdesign/db';

import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import { toRevisionDto } from './sessions.mapper';
import { SessionsService } from './sessions.service';
import { submissionProblems } from './submission';

/**
 * The coach: the same run as a grade, allowed to iterate. The draft is
 * stored first as the author's own revision (iteration 1), and every later
 * iteration that beat everything before it is imported once as an assistant
 * revision when the run is read — so a timeline shows the author's design
 * and the coach's improvements in one sequence, each with its own grade.
 */
@Injectable()
export class ImproveService {
  private readonly logger = new Logger(ImproveService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
    private readonly sessions: SessionsService,
  ) {}

  async start(sessionId: string, request: StartImproveRequest): Promise<StartImproveDto> {
    const { maxIterations, ...submission } = request;
    const { prompt } = await this.sessions.prepareSubmission(sessionId, submission);
    const iterations = Math.min(
      maxIterations ?? DEFAULT_IMPROVE_ITERATIONS,
      MAX_IMPROVE_ITERATIONS,
    );
    const started = await this.sessions.startGradingRun(prompt, submission, iterations);
    const base = await this.sessions.persistRevision(sessionId, submission, 'user', {
      runId: started.runId,
      iteration: 1,
    });
    return { runId: started.runId, revision: toRevisionDto(base) };
  }

  async get(sessionId: string, runId: string): Promise<ImproveRunDto> {
    const base = await this.em.findOne(
      DesignRevision,
      { session: sessionId, qualityRunId: runId, qualityIteration: 1 },
      { populate: ['session.prompt'] },
    );
    if (!base) throw new NotFoundException(`no coaching run ${runId} in session ${sessionId}`);
    const run = await this.loop.getRun(runId);
    if (!run) throw new NotFoundException(`Run ${runId} not found`);

    const header = {
      runId,
      sessionId,
      status: run.status,
      llm: run.llm,
      exchangeCount: run.exchanges.length,
      stopReason: run.trace?.stopReason ?? null,
      error: run.error?.message ?? null,
    };
    if (run.trace === null) return { ...header, iterations: [] };

    const stored = new Map(
      (await this.em.find(DesignRevision, { session: sessionId, qualityRunId: runId })).map(
        (revision) => [revision.qualityIteration, revision],
      ),
    );
    const criteria = base.session.prompt.criteria;
    const iterations: ImproveIterationDto[] = [];
    let bestBefore = Number.NEGATIVE_INFINITY;
    for (const it of run.trace.iterations) {
      const overall = it.decision.scores.overall;
      const cache = { status: run.status, overall, decision: it.decision.finalDecision };
      let revision = stored.get(it.iteration) ?? null;
      if (revision === null && it.iteration > 1 && it.artifact !== null && overall > bestBefore) {
        revision = await this.import(sessionId, runId, it, criteria, cache);
      } else if (revision !== null) {
        revision.evaluationStatus = cache.status;
        revision.overall = cache.overall;
        revision.decision = cache.decision;
      }
      iterations.push({
        iteration: it.iteration,
        mode: it.mode,
        overall,
        decision: it.decision.finalDecision,
        revisionId: revision?.id ?? null,
      });
      bestBefore = Math.max(bestBefore, overall);
    }
    await this.em.flush();
    return { ...header, iterations };
  }

  /**
   * One coach iteration as an assistant revision — only if the loop's
   * artifact is a submission the studio itself would accept. A coach that
   * drew an edge to nowhere is logged and skipped, never stored.
   */
  private async import(
    sessionId: string,
    runId: string,
    it: IterationTrace,
    criteria: readonly SuccessCriterion[],
    cache: { status: QualityRunStatus; overall: number; decision: ImproveIterationDto['decision'] },
  ): Promise<DesignRevision | null> {
    const parsed = designSubmissionSchema.safeParse(it.artifact);
    if (!parsed.success) {
      this.logger.warn(`run ${runId} iteration ${it.iteration}: artifact is not a submission`);
      return null;
    }
    const problems = submissionProblems(parsed.data, criteria);
    if (problems.length > 0) {
      this.logger.warn(
        `run ${runId} iteration ${it.iteration}: not imported — ${problems.join('; ')}`,
      );
      return null;
    }
    try {
      return await this.sessions.persistRevision(
        sessionId,
        parsed.data,
        'assistant',
        { runId, iteration: it.iteration },
        cache,
      );
    } catch (error) {
      // A concurrent poll imported the same iteration; its row is the answer.
      if (error instanceof ConflictException) {
        return this.em.findOne(DesignRevision, {
          qualityRunId: runId,
          qualityIteration: it.iteration,
        });
      }
      throw error;
    }
  }
}
