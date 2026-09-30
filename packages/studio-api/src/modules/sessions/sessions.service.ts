import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LockMode, UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  CANVAS_PIPELINE_ID,
  type AdoptedIterationRef,
  type Decision,
  type DesignSubmission,
  type QualityRunStartedDto,
  type QualityRunStatus,
  type SessionDraft,
  type SessionStatus,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import {
  createRevision,
  DesignRevision,
  DesignSession,
  Prompt,
  type RevisionRun,
} from '@sysdesign/db';

import { PromptsService } from '../prompts/prompts.service';
import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import { EvaluationsService } from './evaluations.service';
import type { ListRevisionsQueryInput, ListSessionsQueryInput } from './session-requests';
import type { SessionWithLatest } from './sessions.mapper';
import { submissionProblems } from './submission';

/** The terminal values an import already knows, written with the row instead of after it. */
export interface RevisionCache {
  status: QualityRunStatus;
  overall: number | null;
  decision: Decision | null;
}

/** What a grading run is started over: the submission itself, or a recorded iteration to adopt. */
export type RunSource = { output: DesignSubmission } | { adopt: AdoptedIterationRef };

/** What every write under the session lock receives: the transaction's manager, the row, its prompt. */
export type LockedWork<T> = (
  em: EntityManager,
  session: DesignSession,
  prompt: Prompt,
) => Promise<T>;

/**
 * Sessions and the revisions under them. A revision is graded by the quality
 * loop: submitting one starts a `system-design-canvas` run over the drawing,
 * the brief and the narrative, against the prompt's own criteria, and the
 * row stores the run's id. The studio checks structure and stores; the loop
 * judges. Every write that starts a run happens under a lock on the session
 * row, so two submits (or a submit and a coach start) on one session are
 * serialised: the second sees the first's running grade and is refused.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
    private readonly prompts: PromptsService,
    private readonly evaluations: EvaluationsService,
  ) {}

  async create(promptId: string): Promise<DesignSession> {
    const prompt = await this.em.findOne(Prompt, promptId);
    if (!prompt) {
      throw new UnprocessableEntityException(`Unknown promptId: ${promptId}`);
    }
    if (prompt.status === 'archived') {
      throw new UnprocessableEntityException('prompt is archived — reactivate it first');
    }

    const session = this.em.create(DesignSession, { prompt });
    this.em.persist(session);
    await this.em.flush();
    return session;
  }

  async list(query: ListSessionsQueryInput): Promise<[SessionWithLatest[], number]> {
    const [sessions, total] = await this.em.findAndCount(
      DesignSession,
      { ...(query.promptId ? { prompt: query.promptId } : {}) },
      {
        // Populated for revisionCount and the latest revision's cached grade;
        // pages are 5–50 rows, so an in-memory fold beats a bespoke aggregate.
        populate: ['revisions'],
        limit: query.limit,
        offset: query.offset,
        orderBy: { updatedAt: 'desc', id: 'asc' },
      },
    );
    return [sessions.map(withLatest), total];
  }

  async findOne(id: string): Promise<SessionWithLatest> {
    const session = await this.em.findOne(DesignSession, id, { populate: ['revisions'] });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    return withLatest(session);
  }

  async updateStatus(id: string, status: SessionStatus): Promise<SessionWithLatest> {
    const found = await this.findOne(id);
    found.session.status = status;
    await this.em.flush();
    return found;
  }

  /**
   * Grade a design. The rubric is made sure of first — a derivation can take
   * minutes and must not hold the row — then, under the session lock: the
   * session is open, the submission refers only to what exists, no earlier
   * grade is still in flight, the run starts, the revision is stored pointing
   * at iteration 1 of it, and the saved draft (now submitted) is cleared. A
   * loop that refuses leaves nothing behind: the transaction rolls back.
   */
  async submitRevision(sessionId: string, submission: DesignSubmission): Promise<DesignRevision> {
    await this.ensureRubric(sessionId);
    return this.withSessionLock(sessionId, async (em, session, prompt) => {
      this.assertSessionOpen(session, prompt);
      this.assertSubmission(submission, prompt.criteria);
      await this.assertNoGradeInFlight(em, session);
      const started = await this.startGradingRun(prompt, { output: submission }, 1);
      const revision = await createRevision(em, sessionId, submission, 'user', {
        runId: started.runId,
        iteration: 1,
      });
      session.draft = null;
      return revision;
    });
  }

  /** The prompt's rubric, derived if it is still empty — outside any lock. */
  async ensureRubric(sessionId: string): Promise<Prompt> {
    const session = await this.em.findOne(DesignSession, sessionId, { populate: ['prompt'] });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    return this.prompts.ensureCriteria(session.prompt);
  }

  /**
   * One transaction holding a write lock on the session row for the whole of
   * `work`. The bare row is locked and the prompt loaded beside it: Postgres
   * refuses `FOR UPDATE` on the outer-joined side of a populate.
   */
  withSessionLock<T>(sessionId: string, work: LockedWork<T>): Promise<T> {
    return this.em.transactional(async (em) => {
      const session = await em.findOne(DesignSession, sessionId, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
      const prompt = await em.findOneOrFail(Prompt, session.prompt.id);
      return work(em, session, prompt);
    });
  }

  /** An in-progress session over a prompt that is not archived — the same rule `create` applies. */
  assertSessionOpen(session: DesignSession, prompt: Prompt): void {
    if (session.status !== 'in-progress') {
      throw new UnprocessableEntityException(
        `session is ${session.status} — only an in-progress session accepts revisions`,
      );
    }
    if (prompt.status === 'archived') {
      throw new UnprocessableEntityException('prompt is archived — reactivate it first');
    }
  }

  /**
   * The graph, brief and narrative refer only to what exists, against the
   * prompt's rubric. Every referential problem is reported at once; nothing
   * here says whether the design is any good.
   */
  assertSubmission(submission: DesignSubmission, criteria: readonly SuccessCriterion[]): void {
    const problems = submissionProblems(submission, criteria);
    if (problems.length > 0) throw new UnprocessableEntityException(problems);
  }

  /**
   * One grade at a time per session. The cache says `running` until someone
   * reads the evaluation, so a latest revision that says so is asked of the
   * loop first — a grade that finished unread is not in flight.
   */
  async assertNoGradeInFlight(em: EntityManager, session: DesignSession): Promise<void> {
    const latest = await em.findOne(
      DesignRevision,
      { session: session.id },
      { orderBy: { revisionNumber: 'desc' } },
    );
    if (latest === null || latest.evaluationStatus !== 'running') return;
    if (latest.qualityRunId === null) return;
    const grade = await this.evaluations.syncRevision(latest, em);
    if (grade.status === 'running') {
      throw new ConflictException(
        `revision #${latest.revisionNumber} is still being graded — wait for its verdict`,
      );
    }
  }

  /** One `system-design-canvas` run on the prompt's fixed rubric: over a submission, or from a recorded iteration. */
  startGradingRun(
    prompt: Prompt,
    source: RunSource,
    maxIterations: number,
  ): Promise<QualityRunStartedDto> {
    if (prompt.criteria.length === 0) {
      throw new ServiceUnavailableException(
        'the grader derived no criteria for this prompt yet — try again shortly',
      );
    }
    return this.loop.startRun({
      pipeline: CANVAS_PIPELINE_ID,
      goal: prompt.markdown,
      criteria: prompt.criteria,
      maxIterations,
      ...source,
    });
  }

  async getDraft(sessionId: string): Promise<SessionDraft | null> {
    const session = await this.em.findOne(DesignSession, sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    return session.draft;
  }

  /** The unsubmitted canvas, shape-checked by the pipe; only an open session keeps one. */
  async saveDraft(sessionId: string, draft: SessionDraft): Promise<void> {
    const session = await this.em.findOne(DesignSession, sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.status !== 'in-progress') {
      throw new UnprocessableEntityException(
        `session is ${session.status} — only an in-progress session keeps a draft`,
      );
    }
    session.draft = draft;
    await this.em.flush();
  }

  /**
   * A revision row written outside the session lock — the coach's imports,
   * which race only with each other. The unique (session, revision_number)
   * and (run, iteration) constraints arbitrate; a loser gets 409 and re-reads.
   */
  async persistRevision(
    sessionId: string,
    submission: DesignSubmission,
    origin: DesignRevision['origin'],
    run: RevisionRun,
    cache?: RevisionCache,
  ): Promise<DesignRevision> {
    try {
      const revision = await this.em.transactional(async (em) => {
        const created = await createRevision(em, sessionId, submission, origin, run);
        if (cache) {
          created.evaluationStatus = cache.status;
          created.overall = cache.overall;
          created.decision = cache.decision;
        }
        return created;
      });
      // The transaction ran on a fork; hand back the row as this context sees it.
      return this.em.findOneOrFail(DesignRevision, revision.id, { refresh: true });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictException('a concurrent submission won this revision number — retry');
      }
      throw error;
    }
  }

  async listRevisions(
    sessionId: string,
    query: ListRevisionsQueryInput,
  ): Promise<[DesignRevision[], number]> {
    const session = await this.em.findOne(DesignSession, sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    return this.em.findAndCount(
      DesignRevision,
      { session: sessionId },
      { limit: query.limit, offset: query.offset, orderBy: { revisionNumber: 'desc' } },
    );
  }
}

/** The newest revision of a session whose revisions are loaded. */
const withLatest = (session: DesignSession): SessionWithLatest => ({
  session,
  latestRevision: session.revisions
    .getItems()
    .reduce<DesignRevision | null>(
      (max, r) => (max === null || r.revisionNumber > max.revisionNumber ? r : max),
      null,
    ),
});
