import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LockMode, UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  CANVAS_PIPELINE_ID,
  describeInFlight,
  PROMPT_COPY,
  regradable,
  type AdoptedIterationRef,
  type Decision,
  type DesignSubmission,
  type QualityRunStartedDto,
  type QualityRunStatus,
  type SessionDraft,
  type SessionInFlightDto,
  type SessionStatus,
  type StartQualityRunRequest,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import {
  CoachingRun,
  createRevision,
  DesignRevision,
  DesignSession,
  Prompt,
  type RevisionRun,
} from '@sysdesign/db';

import { notFound } from '../../common/not-found';
import { PromptsService } from '../prompts/prompts.service';
import { isLoopUnavailable, QualityLoopClient } from '../quality-loop/quality-loop.client';
import { recordCoachingStatus } from './coaching-status';
import { EvaluationsService } from './evaluations.service';
import type { ListRevisionsQueryInput, ListSessionsQueryInput } from './session-requests';
import type { SessionDetail, SessionWithLatest } from './sessions.mapper';
import { submissionProblems } from './submission';

/** The terminal values an import already knows, written with the row instead of after it. */
export interface RevisionCache {
  status: QualityRunStatus;
  overall: number | null;
  decision: Decision | null;
}

/** What a grading run is started over: the submission itself, or a recorded iteration to adopt. */
export type RunSource = { output: DesignSubmission } | { adopt: AdoptedIterationRef };

/**
 * What each kind of run asks of the loop beyond the run itself. A coach
 * recalls lessons from earlier runs for its producer — the lenses never see
 * them; a grade never recalls, so an author's score rests on the prompt alone.
 */
const RUN_KINDS = {
  grade: {},
  coach: { recall: true },
} as const satisfies Record<string, Pick<StartQualityRunRequest, 'recall'>>;
export type RunKind = keyof typeof RUN_KINDS;

/**
 * Who asks which run holds the slot. A `write` must know: the grader is
 * asked, and a grader that cannot answer refuses the write. A `read` says
 * what it cannot learn: a run the record says is running is `unknown` while
 * the grader cannot be asked, and the read still answers.
 */
type SlotAsker = 'write' | 'read';

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
 * serialised: the second sees the first's run in flight and is refused. A
 * revision's design never changes; the run its grade points at can, once —
 * a grade that failed is run again in place rather than as a second copy.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
    private readonly prompts: PromptsService,
    private readonly evaluations: EvaluationsService,
  ) {}

  async create(promptId: string): Promise<SessionDetail> {
    const prompt = await this.em.findOne(Prompt, promptId);
    if (!prompt) {
      throw new UnprocessableEntityException(`Unknown promptId: ${promptId}`);
    }
    if (prompt.status === 'archived') {
      throw new UnprocessableEntityException(PROMPT_COPY.archived);
    }

    const session = this.em.create(DesignSession, { prompt });
    this.em.persist(session);
    await this.em.flush();
    return this.detail({ session, latestRevision: null });
  }

  async list(query: ListSessionsQueryInput): Promise<[SessionWithLatest[], number]> {
    const [sessions, total] = await this.em.findAndCount(
      DesignSession,
      { ...(query.promptId ? { prompt: query.promptId } : {}) },
      {
        // Populated for revisionCount, the latest revision's cached grade and
        // the prompt's title; pages are 5–50 rows, so an in-memory fold beats
        // a bespoke aggregate.
        populate: ['revisions', 'prompt'],
        limit: query.limit,
        offset: query.offset,
        orderBy: { updatedAt: 'desc', id: 'asc' },
      },
    );
    const page = sessions.map(withLatest);
    await this.evaluations.refreshStandings(
      page.flatMap(({ latestRevision }) => latestRevision ?? []),
    );
    return [page, total];
  }

  async findOne(id: string): Promise<SessionDetail> {
    return this.detail(await this.load(id));
  }

  async updateStatus(id: string, status: SessionStatus): Promise<SessionDetail> {
    const found = await this.load(id);
    found.session.status = status;
    await this.em.flush();
    return this.detail(found);
  }

  private async load(id: string): Promise<SessionWithLatest> {
    const session = await this.em.findOne(DesignSession, id, {
      populate: ['revisions', 'prompt'],
    });
    if (!session) throw notFound('session', `Session ${id} not found`);
    const found = withLatest(session);
    if (found.latestRevision !== null) {
      await this.evaluations.refreshStandings([found.latestRevision]);
    }
    return found;
  }

  private async detail(found: SessionWithLatest): Promise<SessionDetail> {
    return { ...found, inFlight: await this.inFlight(this.em, found.session, 'read') };
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

  /**
   * Grade a stored revision again, in place: the same design, a fresh run,
   * and the revision pointing at it — no second revision. Only for a revision
   * with no grade and none coming: its run failed, the grader no longer has
   * it, it was stored before grading moved to the loop, or its grade
   * assessed too little to be a verdict. A grade that stands, or is still
   * running, is refused (409). Everything else is a
   * submit's rule, under the same lock: an open session, nothing else in
   * flight, a design that still refers only to what exists. The draft is
   * not touched — nothing was submitted.
   */
  async regradeRevision(revisionId: string): Promise<DesignRevision> {
    const found = await this.em.findOne(DesignRevision, revisionId);
    if (!found) throw notFound('revision', `Revision ${revisionId} not found`);
    const sessionId = found.session.id;
    await this.ensureRubric(sessionId);
    return this.withSessionLock(sessionId, async (em, session, prompt) => {
      // Read again under the lock: a re-grade that won the lock first has
      // already repointed it, and this one must see that run, not the old.
      const revision = await em.findOne(DesignRevision, revisionId, { refresh: true });
      if (!revision) throw notFound('revision', `Revision ${revisionId} not found`);
      this.assertSessionOpen(session, prompt);
      await this.assertNoGradeToKeep(em, revision);
      await this.assertNoGradeInFlight(em, session);
      const submission: DesignSubmission = {
        graph: revision.graph,
        brief: revision.brief,
        narrative: revision.narrative,
        model: revision.model,
      };
      this.assertSubmission(submission, prompt.criteria);
      const started = await this.startGradingRun(prompt, { output: submission }, 1);
      revision.qualityRunId = started.runId;
      revision.qualityIteration = 1;
      revision.evaluationStatus = 'running';
      revision.overall = null;
      revision.decision = null;
      revision.evaluationError = null;
      return revision;
    });
  }

  /**
   * A revision may be graded again only when there is no grade to lose: the
   * loop is asked, since the cache says `running` until someone reads it. A
   * run it does not have, or a revision that never had one, has none; one
   * that failed, or assessed too little to be a verdict, has none to keep
   * (`regradable`).
   */
  private async assertNoGradeToKeep(em: EntityManager, revision: DesignRevision): Promise<void> {
    if (revision.qualityRunId === null || revision.qualityIteration === null) return;
    const grade = await this.evaluations.syncRevision(revision, em);
    if (grade === null || regradable(grade)) return;
    throw new ConflictException(
      grade.status === 'running'
        ? describeInFlight({
            kind: 'grade',
            runId: revision.qualityRunId,
            revisionNumber: revision.revisionNumber,
            state: 'running',
          })
        : `Revision #${revision.revisionNumber} is already graded — its grade stands.`,
    );
  }

  /** The prompt's rubric, derived if it is still empty — outside any lock. */
  async ensureRubric(sessionId: string): Promise<Prompt> {
    const session = await this.em.findOne(DesignSession, sessionId, { populate: ['prompt'] });
    if (!session) throw notFound('session', `Session ${sessionId} not found`);
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
      if (!session) throw notFound('session', `Session ${sessionId} not found`);
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
      throw new UnprocessableEntityException(PROMPT_COPY.archived);
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
   * One run at a time per session: a submit or a coach start is refused while
   * another holds the slot. Asked as a write, under the session lock — a
   * grader that cannot say whether the slot is free refuses the write too.
   */
  async assertNoGradeInFlight(em: EntityManager, session: DesignSession): Promise<void> {
    const inFlight = await this.inFlight(em, session, 'write');
    if (inFlight !== null) throw new ConflictException(describeInFlight(inFlight));
  }

  /**
   * The run holding the session's one grading slot. The loop is asked only
   * about a run the studio's record says is running, and what it says of a
   * finished one is recorded, so a session whose runs have ended reads
   * without the grader. A coaching run comes first: it grades as it revises,
   * from a draft or from an adopted grade alike, and only the newest can be
   * live, since each start was refused while another was. Then any
   * revision's grade the record says is running, newest first — a submit's
   * is the latest revision's, a re-grade's may be an earlier one's — and its
   * cache says `running` until someone reads the evaluation, so a grade that
   * finished unread is not in flight. A run the loop does not have holds
   * nothing, a coach's or a grade's alike: nothing can be running it, so it
   * never makes a read fail or a write wait.
   */
  private async inFlight(
    em: EntityManager,
    session: DesignSession,
    asker: SlotAsker,
  ): Promise<SessionInFlightDto | null> {
    const coaching = await em.findOne(
      CoachingRun,
      { session: session.id },
      { orderBy: { startedAt: 'desc', runId: 'desc' }, populate: ['baseRevision'] },
    );
    if (coaching !== null && coaching.status === 'running') {
      const state = await this.ask(asker, async () => {
        const run = await this.loop.getRun(coaching.runId);
        if (run !== null && recordCoachingStatus(coaching, run.status)) await em.flush();
        return run?.status ?? null;
      });
      if (state === 'running' || state === 'unknown') {
        return {
          kind: 'coach',
          runId: coaching.runId,
          revisionNumber: coaching.baseRevision.revisionNumber,
          state,
        };
      }
    }
    const grading = await em.find(
      DesignRevision,
      { session: session.id, evaluationStatus: 'running' },
      // As stored now: a row this context read before the lock may since point at another run.
      { orderBy: { revisionNumber: 'desc' }, refresh: true },
    );
    for (const revision of grading) {
      const { qualityRunId: runId, revisionNumber } = revision;
      if (runId === null) continue;
      const state = await this.ask(
        asker,
        async () => (await this.evaluations.syncRevision(revision, em))?.status ?? null,
      );
      if (state === 'running' || state === 'unknown') {
        return { kind: 'grade', runId, revisionNumber, state };
      }
    }
    return null;
  }

  /** The loop's answer — or, for a read, `unknown` when the loop cannot give one. */
  private async ask<A>(asker: SlotAsker, question: () => Promise<A>): Promise<A | 'unknown'> {
    try {
      return await question();
    } catch (error) {
      if (asker === 'read' && isLoopUnavailable(error)) return 'unknown';
      throw error;
    }
  }

  /**
   * One `system-design-canvas` run on the prompt's fixed rubric: over a
   * submission, or from a recorded iteration — a grade, or a coach.
   */
  startGradingRun(
    prompt: Prompt,
    source: RunSource,
    maxIterations: number,
    kind: RunKind = 'grade',
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
      ...RUN_KINDS[kind],
    });
  }

  async getDraft(sessionId: string): Promise<SessionDraft | null> {
    const session = await this.em.findOne(DesignSession, sessionId);
    if (!session) throw notFound('session', `Session ${sessionId} not found`);
    return session.draft;
  }

  /** The unsubmitted canvas, shape-checked by the pipe; only an open session keeps one. */
  async saveDraft(sessionId: string, draft: SessionDraft): Promise<void> {
    const session = await this.em.findOne(DesignSession, sessionId);
    if (!session) throw notFound('session', `Session ${sessionId} not found`);
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
    if (!session) throw notFound('session', `Session ${sessionId} not found`);
    const [revisions, total] = await this.em.findAndCount(
      DesignRevision,
      { session: sessionId },
      { limit: query.limit, offset: query.offset, orderBy: { revisionNumber: 'desc' } },
    );
    await this.evaluations.refreshStandings(revisions);
    return [revisions, total];
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
