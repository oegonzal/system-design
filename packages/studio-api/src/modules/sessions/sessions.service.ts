import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  DEFAULT_LIST_LIMIT,
  validateBriefReferences,
  validateGraphReferences,
  validateNarration,
  validateWorkflowReferences,
  type BriefSuggestionsDto,
  type SessionStatus,
} from '@sysdesign/contracts';
import {
  createRevisionRecords,
  DesignRevision,
  DesignSession,
  Evaluation,
  Prompt,
} from '@sysdesign/db';
import { asRecordable, type LlmClient } from '@sysdesign/llm';
import { GIT_CONTEXT, makeRunId, writeDump } from '@sysdesign/run-dump';

import { LLM_CLIENT } from '../llm/llm.token';
import type { BriefSuggestionsRequestDto } from './dto/brief-suggestions.dto';
import { suggestBindings } from './suggestions/suggest-bindings';
import {
  buildSuggestionDump,
  startSuggestionDump,
  type SuggestionDump,
  type SuggestionDumpLlm,
} from './suggestions/suggestion-dump';
import type { ListSessionsQueryDto } from './dto/list-sessions-query.dto';
import type { ListRevisionsQueryDto } from './dto/list-revisions-query.dto';
import type { SubmitRevisionRequestDto } from './dto/submit-revision.dto';
import { EvalQueue } from './eval-queue';

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
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly evalQueue: EvalQueue,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  /**
   * Candidate bindings for a draft the author has not submitted.
   *
   * Read-only by construction: nothing here writes to `DesignRevision.brief`,
   * which is the only field the grade reads. A proposal becomes a claim solely
   * by the author accepting it in the editor and submitting a revision — so
   * this endpoint has no path to the score at all, which is why it lives in the
   * API rather than as an eval pass.
   *
   * An absent model is not an error: the response shape is identical with and
   * without one, an empty list being the deterministic answer. That also keeps
   * the shape the e2e suite exercises (which always runs deterministic) the
   * same shape production returns.
   */
  async suggestBrief(
    sessionId: string,
    dto: BriefSuggestionsRequestDto,
  ): Promise<BriefSuggestionsDto> {
    const session = await this.em.findOne(
      DesignSession,
      { id: sessionId },
      { populate: ['prompt'] },
    );
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const problems = [
      ...validateGraphReferences(dto.graph),
      ...validateWorkflowReferences(dto.graph, session.prompt.workflowSpec ?? null),
    ];
    if (problems.length > 0) {
      throw new UnprocessableEntityException(problems);
    }

    const dump = startSuggestionDump({
      runId: makeRunId(Date.now(), 'suggestion'),
      sessionId,
      now: Date.now(),
      llm: this.llmStatus(),
      git: GIT_CONTEXT,
    });
    dump.input({
      promptId: session.prompt.id,
      graph: dto.graph,
      narrative: dto.narrative ?? null,
    });

    try {
      const llm = asRecordable(this.llm)?.withRecorder(dump.record) ?? this.llm;
      const proposals = await suggestBindings(llm, {
        graph: dto.graph,
        narrative: dto.narrative ?? null,
        nfrs: session.prompt.nonFunctionalRequirements,
        functionalRequirements: session.prompt.functionalRequirements,
      });
      dump.offered(proposals);
      // Reports whether a model RAN, not whether it found anything. A model
      // that ran and had nothing to offer is a different fact from no model at
      // all, and collapsing them would make an empty list unreadable.
      return { proposals, model: this.llm.enabled ? this.llm.model : null };
    } catch (error) {
      dump.failed(error);
      throw error;
    } finally {
      this.writeDump(dump);
    }
  }

  /**
   * Swallows deliberately: this runs in a `finally`, so a throw would replace
   * whatever the request was already reporting. An audit trail must never cost
   * a response.
   */
  private writeDump(dump: SuggestionDump): void {
    try {
      writeDump(buildSuggestionDump(dump.state, Date.now()));
    } catch (error) {
      this.logger.warn(
        `suggestion run dump ${dump.state.runId} not written: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /** Derived facts only — the API key is never recorded, in any form. */
  private llmStatus(): SuggestionDumpLlm {
    const deterministic = process.env['EVAL_DETERMINISTIC'] === '1';
    return {
      enabled: this.llm.enabled,
      model: this.llm.model,
      reason: this.llm.enabled ? null : deterministic ? 'deterministic' : 'no-key',
    };
  }

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
    // The prompt is populated because a brief's references are checked against
    // it: an nfrId it never declared, or a functional requirement index past
    // the end, is impossible rather than merely unsupported.
    const session = await this.em.findOne(DesignSession, sessionId, { populate: ['prompt'] });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    if (session.status !== 'in-progress') {
      throw new UnprocessableEntityException(
        `session is ${session.status} — only an in-progress session accepts revisions`,
      );
    }

    const problems = [
      ...validateGraphReferences(dto.graph),
      ...validateWorkflowReferences(dto.graph, session.prompt.workflowSpec ?? null),
      ...(dto.brief ? validateBriefReferences(dto.graph, dto.brief, session.prompt) : []),
      ...(dto.narrative ? validateNarration(dto.graph, dto.narrative, session.prompt) : []),
    ];
    if (problems.length > 0) {
      throw new UnprocessableEntityException(problems);
    }

    try {
      return await this.em.transactional((em) =>
        createRevisionRecords(em, sessionId, dto, 'user', (txEm, revision) =>
          this.evalQueue.enqueue(txEm, revision),
        ),
      );
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
