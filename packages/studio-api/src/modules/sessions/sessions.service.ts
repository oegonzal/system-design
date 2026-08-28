import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { DEFAULT_LIST_LIMIT, type SessionStatus } from '@sysdesign/contracts';
import { DesignRevision, DesignSession, Evaluation, Prompt } from '@sysdesign/db';

import type { ListSessionsQueryDto } from './dto/list-sessions-query.dto';
import type { ListRevisionsQueryDto } from './dto/list-revisions-query.dto';
import type { SubmitRevisionRequestDto } from './dto/submit-revision.dto';
import { EvalQueue } from './eval-queue';
import { validateGraphReferences } from './graph-validator';

/** A session plus what its DTO summarises about the newest revision. */
export interface SessionWithLatest {
  session: DesignSession;
  latestRevision: DesignRevision | null;
  latestEvaluation: Evaluation | null;
}

export interface RevisionWithEvaluation {
  revision: DesignRevision;
  evaluation: Evaluation | null;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly em: EntityManager,
    private readonly evalQueue: EvalQueue,
  ) {}

  async create(promptId: string): Promise<DesignSession> {
    const prompt = await this.em.findOne(Prompt, promptId);
    if (!prompt) {
      throw new UnprocessableEntityException(`Unknown promptId: ${promptId}`);
    }
    if (prompt.status === 'archived') {
      throw new UnprocessableEntityException('prompt is archived — regenerate or reactivate it');
    }

    const session = this.em.create(DesignSession, { prompt });
    this.em.persist(session);
    await this.em.flush();
    return session;
  }

  async list(query: ListSessionsQueryDto): Promise<[SessionWithLatest[], number]> {
    const [sessions, total] = await this.em.findAndCount(
      DesignSession,
      { ...(query.promptId ? { prompt: query.promptId } : {}) },
      {
        // Populated for revisionCount/latestRevisionNumber; pages are 5–50
        // rows, so an in-memory fold beats a bespoke aggregate query here.
        populate: ['revisions'],
        limit: query.limit ?? DEFAULT_LIST_LIMIT,
        offset: query.offset ?? 0,
        orderBy: { updatedAt: 'desc', id: 'asc' },
      },
    );

    return [await this.withLatest(sessions), total];
  }

  async findOne(id: string): Promise<SessionWithLatest> {
    const session = await this.em.findOne(DesignSession, id, { populate: ['revisions'] });
    if (!session) {
      throw new NotFoundException(`Session ${id} not found`);
    }
    const [withLatest] = await this.withLatest([session]);
    return withLatest;
  }

  async updateStatus(id: string, status: SessionStatus): Promise<SessionWithLatest> {
    const withLatest = await this.findOne(id);
    withLatest.session.status = status;
    await this.em.flush();
    return withLatest;
  }

  /**
   * One transaction for the whole submit: revision numbering, the queued
   * evaluation and the queue entry commit together or not at all — the eval
   * worker can never observe a revision without its job.
   */
  async submitRevision(
    sessionId: string,
    dto: SubmitRevisionRequestDto,
  ): Promise<RevisionWithEvaluation> {
    const session = await this.em.findOne(DesignSession, sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    if (session.status !== 'in-progress') {
      throw new UnprocessableEntityException(
        `session is ${session.status} — only an in-progress session accepts revisions`,
      );
    }

    const problems = validateGraphReferences(dto.graph);
    if (problems.length > 0) {
      throw new UnprocessableEntityException(problems);
    }

    try {
      return await this.em.transactional(async (em) => {
        const latest = await em.findOne(
          DesignRevision,
          { session: sessionId },
          { orderBy: { revisionNumber: 'desc' } },
        );

        const revision = em.create(DesignRevision, {
          session: sessionId,
          revisionNumber: (latest?.revisionNumber ?? 0) + 1,
          graph: dto.graph,
          notes: dto.notes ?? null,
        });
        em.persist(revision);

        // Born queued; the worker moves it through running → complete/failed.
        const evaluation = em.create(Evaluation, { revision });
        em.persist(evaluation);

        await this.evalQueue.enqueue(em, revision);

        return { revision, evaluation };
      });
    } catch (err) {
      // Two concurrent submits computed the same revisionNumber; the unique
      // (session, revision_number) constraint is the arbiter.
      if (err instanceof UniqueConstraintViolationException) {
        throw new ConflictException('a concurrent submission won this revision number — retry');
      }
      throw err;
    }
  }

  async listRevisions(
    sessionId: string,
    query: ListRevisionsQueryDto,
  ): Promise<[RevisionWithEvaluation[], number]> {
    const session = await this.em.findOne(DesignSession, sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const [revisions, total] = await this.em.findAndCount(
      DesignRevision,
      { session: sessionId },
      {
        limit: query.limit ?? DEFAULT_LIST_LIMIT,
        offset: query.offset ?? 0,
        orderBy: { revisionNumber: 'desc' },
      },
    );

    const evaluationByRevisionId = await this.evaluationsFor(revisions);
    return [
      revisions.map((revision) => ({
        revision,
        evaluation: evaluationByRevisionId.get(revision.id) ?? null,
      })),
      total,
    ];
  }

  /** Resolves each session's newest revision and that revision's evaluation. */
  private async withLatest(sessions: DesignSession[]): Promise<SessionWithLatest[]> {
    const latestBySessionId = new Map<string, DesignRevision | null>(
      sessions.map((session) => [
        session.id,
        session.revisions
          .getItems()
          .reduce<DesignRevision | null>(
            (max, r) => (max === null || r.revisionNumber > max.revisionNumber ? r : max),
            null,
          ),
      ]),
    );

    const latestRevisions = [...latestBySessionId.values()].filter(
      (r): r is DesignRevision => r !== null,
    );
    const evaluationByRevisionId = await this.evaluationsFor(latestRevisions);

    return sessions.map((session) => {
      const latestRevision = latestBySessionId.get(session.id) ?? null;
      return {
        session,
        latestRevision,
        latestEvaluation: latestRevision
          ? (evaluationByRevisionId.get(latestRevision.id) ?? null)
          : null,
      };
    });
  }

  /** One IN query instead of an N+1 — Evaluation points at Revision, not back. */
  private async evaluationsFor(revisions: DesignRevision[]): Promise<Map<string, Evaluation>> {
    if (revisions.length === 0) {
      return new Map();
    }
    const evaluations = await this.em.find(Evaluation, {
      revision: { $in: revisions.map((r) => r.id) },
    });
    return new Map(evaluations.map((e) => [e.revision.id, e]));
  }
}
