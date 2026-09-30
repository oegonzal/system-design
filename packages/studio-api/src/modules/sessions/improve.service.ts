import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  DEFAULT_IMPROVE_ITERATIONS,
  designSubmissionSchema,
  MAX_IMPROVE_ITERATIONS,
  type CoachingRunSummaryDto,
  type Decision,
  type DesignSubmission,
  type ImproveIterationDto,
  type ImproveIterationOutcome,
  type ImproveRunDto,
  type IterationTrace,
  type QualityRunStatus,
  type StartImproveDto,
  type StartImproveRequest,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import { CoachingRun, createRevision, DesignRevision, DesignSession } from '@sysdesign/db';

import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import { EvaluationsService } from './evaluations.service';
import { toCoachingRunSummaryDto, toRevisionDto } from './sessions.mapper';
import { SessionsService } from './sessions.service';
import { submissionProblems } from './submission';

/** The terminal values an iteration's revision caches. */
interface IterationCache {
  status: QualityRunStatus;
  overall: number;
  decision: Decision;
}

/**
 * The coach: the same run as a grade, allowed to iterate. It starts from
 * the draft — stored first as the author's own revision and graded as
 * iteration 1 — or from a graded revision, whose recorded grade the loop
 * adopts verbatim as iteration 1 so nothing is graded twice or stored
 * twice. Every later iteration that beat everything before it is imported
 * once as an assistant revision when the run is read, so a timeline shows
 * the author's design and the coach's improvements in one sequence, each
 * with its own grade. Every run is recorded on the session, so a reloaded
 * workspace finds what to poll.
 */
@Injectable()
export class ImproveService {
  private readonly logger = new Logger(ImproveService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
    private readonly sessions: SessionsService,
    private readonly evaluations: EvaluationsService,
  ) {}

  async start(sessionId: string, request: StartImproveRequest): Promise<StartImproveDto> {
    const iterations = Math.min(
      request.maxIterations ?? DEFAULT_IMPROVE_ITERATIONS,
      MAX_IMPROVE_ITERATIONS,
    );
    await this.sessions.ensureRubric(sessionId);
    if ('baseRevisionId' in request) {
      return this.startFromRevision(sessionId, request.baseRevisionId, iterations);
    }
    const { maxIterations: _ignored, ...submission } = request;
    return this.startFromDraft(sessionId, submission, iterations);
  }

  /** The draft becomes the author's revision at `(runId, 1)`; the saved draft is cleared. */
  private startFromDraft(
    sessionId: string,
    submission: DesignSubmission,
    maxIterations: number,
  ): Promise<StartImproveDto> {
    return this.sessions.withSessionLock(sessionId, async (em, session, prompt) => {
      this.sessions.assertSessionOpen(session, prompt);
      this.sessions.assertSubmission(submission, prompt.criteria);
      await this.sessions.assertNoGradeInFlight(em, session);
      const started = await this.sessions.startGradingRun(
        prompt,
        { output: submission },
        maxIterations,
      );
      const base = await createRevision(em, sessionId, submission, 'user', {
        runId: started.runId,
        iteration: 1,
      });
      em.persist(
        em.create(CoachingRun, {
          runId: started.runId,
          session: session.id,
          baseRevision: base,
          maxIterations,
        }),
      );
      session.draft = null;
      return { runId: started.runId, revision: toRevisionDto(base) };
    });
  }

  /**
   * A graded revision of this session is the starting point: its recorded
   * grade must be complete — asked of the loop first, since the cache says
   * `running` until someone reads it — and the run adopts it verbatim. The
   * draft is untouched: the workspace adopts only when the canvas is clean.
   */
  private async startFromRevision(
    sessionId: string,
    baseRevisionId: string,
    maxIterations: number,
  ): Promise<StartImproveDto> {
    const base = await this.em.findOne(DesignRevision, { id: baseRevisionId, session: sessionId });
    if (!base) throw new NotFoundException(`no revision ${baseRevisionId} in session ${sessionId}`);
    if (base.qualityRunId === null || base.qualityIteration === null) {
      throw new UnprocessableEntityException(
        `revision #${base.revisionNumber} was graded before delegation and has no grade to adopt — submit it again`,
      );
    }
    const grade = await this.evaluations.syncRevision(base);
    if (grade.status === 'running') {
      throw new ConflictException(
        `revision #${base.revisionNumber} is still being graded — wait for its verdict`,
      );
    }
    if (grade.status !== 'complete') {
      throw new UnprocessableEntityException(
        `revision #${base.revisionNumber} has no grade to adopt: its run ${grade.status} — submit it again`,
      );
    }
    const adopt = { runId: base.qualityRunId, iteration: base.qualityIteration };
    return this.sessions.withSessionLock(sessionId, async (em, session, prompt) => {
      this.sessions.assertSessionOpen(session, prompt);
      await this.sessions.assertNoGradeInFlight(em, session);
      const started = await this.sessions.startGradingRun(prompt, { adopt }, maxIterations);
      em.persist(
        em.create(CoachingRun, {
          runId: started.runId,
          session: session.id,
          baseRevision: base.id,
          maxIterations,
        }),
      );
      return { runId: started.runId, revision: toRevisionDto(base) };
    });
  }

  async list(sessionId: string): Promise<CoachingRunSummaryDto[]> {
    const session = await this.em.findOne(DesignSession, sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    const runs = await this.em.find(
      CoachingRun,
      { session: sessionId },
      { orderBy: { startedAt: 'desc', runId: 'desc' } },
    );
    return runs.map(toCoachingRunSummaryDto);
  }

  async get(sessionId: string, runId: string): Promise<ImproveRunDto> {
    const coaching = await this.em.findOne(
      CoachingRun,
      { runId, session: sessionId },
      { populate: ['baseRevision', 'session.prompt'] },
    );
    if (!coaching) throw new NotFoundException(`no coaching run ${runId} in session ${sessionId}`);
    const run = await this.loop.getRun(runId);
    if (!run) throw new NotFoundException(`Run ${runId} not found`);

    const base = coaching.baseRevision;
    // The base's grade is this run's own only on the draft path; an adopted
    // base keeps the grade of the run it came from, whatever became of this one.
    const ownsBase = base.qualityRunId === runId;
    const header = {
      runId,
      sessionId,
      baseRevisionId: base.id,
      maxIterations: coaching.maxIterations,
      status: run.status,
      llm: run.llm,
      exchangeCount: run.exchanges.length,
      stopReason: run.trace?.stopReason ?? null,
      error: run.error?.message ?? null,
    };
    if (run.trace === null) {
      if (run.status === 'failed' && ownsBase && base.evaluationStatus !== 'failed') {
        base.evaluationStatus = 'failed';
        await this.em.flush();
      }
      return { ...header, iterations: [] };
    }

    const stored = new Map(
      (await this.em.find(DesignRevision, { session: sessionId, qualityRunId: runId })).map(
        (revision) => [revision.qualityIteration, revision],
      ),
    );
    const criteria = coaching.session.prompt.criteria;
    const iterations: ImproveIterationDto[] = [];
    let bestBefore = Number.NEGATIVE_INFINITY;
    for (const it of run.trace.iterations) {
      const overall = it.decision.scores.overall;
      const cache: IterationCache = {
        status: run.status,
        overall,
        decision: it.decision.finalDecision,
      };
      let revision: DesignRevision | null = null;
      let outcome: ImproveIterationOutcome = 'not-better';
      let problems: string[] = [];
      if (it.iteration === 1) {
        revision = base;
        outcome = 'base';
        if (ownsBase) writeCache(base, cache);
      } else if ((revision = stored.get(it.iteration) ?? null) !== null) {
        outcome = 'imported';
        writeCache(revision, cache);
      } else if (it.artifact !== null && overall > bestBefore) {
        const imported = await this.import(sessionId, runId, it, criteria, cache);
        if ('revision' in imported) {
          revision = imported.revision;
          outcome = 'imported';
        } else {
          outcome = 'refused';
          problems = imported.problems;
        }
      }
      iterations.push({
        iteration: it.iteration,
        mode: it.mode,
        overall,
        decision: it.decision.finalDecision,
        reason: it.decision.reason,
        outcome,
        problems,
        revisionId: revision?.id ?? null,
      });
      bestBefore = Math.max(bestBefore, overall);
    }
    await this.em.flush();
    return { ...header, iterations };
  }

  /**
   * One coach iteration as an assistant revision — only if the loop's
   * artifact is a submission the studio itself would accept. The loop
   * repairs what it can before judging, so what arrives here is what was
   * judged; a coach that still drew an edge to nowhere is refused with the
   * reasons, logged, and never stored — the studio repairs nothing.
   */
  private async import(
    sessionId: string,
    runId: string,
    it: IterationTrace,
    criteria: readonly SuccessCriterion[],
    cache: IterationCache,
  ): Promise<{ revision: DesignRevision } | { problems: string[] }> {
    const parsed = designSubmissionSchema.safeParse(it.artifact);
    if (!parsed.success) {
      this.logger.warn(`run ${runId} iteration ${it.iteration}: artifact is not a submission`);
      return { problems: ['the artifact is not a submission'] };
    }
    const problems = submissionProblems(parsed.data, criteria);
    if (problems.length > 0) {
      this.logger.warn(
        `run ${runId} iteration ${it.iteration}: not imported — ${problems.join('; ')}`,
      );
      return { problems };
    }
    try {
      return {
        revision: await this.sessions.persistRevision(
          sessionId,
          parsed.data,
          'assistant',
          { runId, iteration: it.iteration },
          cache,
        ),
      };
    } catch (error) {
      // A concurrent poll imported the same iteration; its row is the answer.
      if (error instanceof ConflictException) {
        const revision = await this.em.findOne(DesignRevision, {
          qualityRunId: runId,
          qualityIteration: it.iteration,
        });
        if (revision !== null) return { revision };
        return {
          problems: [
            'a concurrent submission took this revision number; imported on the next read',
          ],
        };
      }
      throw error;
    }
  }
}

function writeCache(revision: DesignRevision, cache: IterationCache): void {
  revision.evaluationStatus = cache.status;
  revision.overall = cache.overall;
  revision.decision = cache.decision;
}
