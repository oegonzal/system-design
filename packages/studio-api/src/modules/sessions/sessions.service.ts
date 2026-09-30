import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  CANVAS_PIPELINE_ID,
  type Decision,
  type DesignSubmission,
  type QualityRunStartedDto,
  type QualityRunStatus,
  type SessionStatus,
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
import type { ListRevisionsQueryInput, ListSessionsQueryInput } from './session-requests';
import type { SessionWithLatest } from './sessions.mapper';
import { submissionProblems } from './submission';

/** The terminal values an import already knows, written with the row instead of after it. */
export interface RevisionCache {
  status: QualityRunStatus;
  overall: number | null;
  decision: Decision | null;
}

/** A submission checked and ready to grade: the session it belongs to and the prompt it answers. */
export interface PreparedSubmission {
  session: DesignSession;
  prompt: Prompt;
}

/**
 * Sessions and the revisions under them. A revision is graded by the quality
 * loop: submitting one starts a `system-design-canvas` run over the drawing,
 * the brief and the narrative, against the prompt's own criteria, and the
 * row stores the run's id. The studio checks structure and stores; the loop
 * judges.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
    private readonly prompts: PromptsService,
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
   * Grade a design: the run starts before anything is written, so a loop
   * that refuses leaves no half-graded revision behind; then the revision is
   * stored pointing at iteration 1 of its own run.
   */
  async submitRevision(sessionId: string, submission: DesignSubmission): Promise<DesignRevision> {
    const { prompt } = await this.prepareSubmission(sessionId, submission);
    const started = await this.startGradingRun(prompt, submission, 1);
    return this.persistRevision(sessionId, submission, 'user', {
      runId: started.runId,
      iteration: 1,
    });
  }

  /**
   * Everything a submission must pass before a run is started, shared with the
   * coach: the session exists and is open, the prompt has its rubric, and the
   * graph, brief and narrative refer only to what exists. Every referential
   * problem is reported at once.
   */
  async prepareSubmission(
    sessionId: string,
    submission: DesignSubmission,
  ): Promise<PreparedSubmission> {
    const session = await this.em.findOne(DesignSession, sessionId, { populate: ['prompt'] });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.status !== 'in-progress') {
      throw new UnprocessableEntityException(
        `session is ${session.status} — only an in-progress session accepts revisions`,
      );
    }
    const prompt = await this.prompts.ensureCriteria(session.prompt);
    const problems = submissionProblems(submission, prompt.criteria);
    if (problems.length > 0) throw new UnprocessableEntityException(problems);
    return { session, prompt };
  }

  /** One `system-design-canvas` run over the submission, on the prompt's fixed rubric. */
  startGradingRun(
    prompt: Prompt,
    submission: DesignSubmission,
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
      output: submission,
      criteria: prompt.criteria,
      maxIterations,
    });
  }

  /**
   * The one write of a revision row, in its own transaction. The unique
   * (session, revision_number) and (run, iteration) constraints arbitrate
   * concurrent writers; a loser gets 409 and may retry or re-read.
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
