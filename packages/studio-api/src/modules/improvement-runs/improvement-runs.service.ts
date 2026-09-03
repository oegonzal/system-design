import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  DEFAULT_IMPROVE_ITERATIONS,
  MAX_IMPROVE_ITERATIONS,
  validateBriefReferences,
  validateGraphReferences,
  validateNarration,
  validateWorkflowReferences,
  type ImproverAvailabilityDto,
} from '@sysdesign/contracts';
import { createRevisionRecords, DesignSession, ImprovementRun } from '@sysdesign/db';
import { improverAvailabilityFromEnv } from '@sysdesign/llm';

import { EvalQueue } from '../sessions/eval-queue';
import type { StartImprovementRunRequestDto } from './dto/start-improvement-run.dto';

/**
 * The API half of the AI coach: it persists the ask (base revision + queued
 * run) and answers polls. The improvement loop itself lives in the eval
 * worker — this service never proposes, never scores, never calls a model.
 */
@Injectable()
export class ImprovementRunsService {
  constructor(
    private readonly em: EntityManager,
    private readonly evalQueue: EvalQueue,
  ) {}

  /**
   * Read per request rather than at boot so a spec (or an operator fixing
   * env) sees the truth without a process restart. Derived facts only.
   */
  availability(): ImproverAvailabilityDto {
    return improverAvailabilityFromEnv();
  }

  /**
   * One transaction persists the author's current design as a base revision
   * (origin 'user', evaluated by the normal pipeline) and the queued run —
   * a lost race leaves no stray revision. The partial unique index on
   * (session) where status in (queued, running) is the real one-active-run
   * arbiter; the pre-check below only makes the common case friendly.
   */
  async start(sessionId: string, dto: StartImprovementRunRequestDto): Promise<ImprovementRun> {
    const session = await this.em.findOne(DesignSession, sessionId, { populate: ['prompt'] });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    if (session.status !== 'in-progress') {
      throw new UnprocessableEntityException(
        `session is ${session.status} — only an in-progress session can be improved`,
      );
    }

    const availability = this.availability();
    if (!availability.enabled) {
      throw new ConflictException(
        availability.reason === 'deterministic'
          ? 'the AI coach is disabled in deterministic mode — set IMPROVER_DETERMINISTIC=0 to enable it'
          : 'the AI coach needs a live model — set ANTHROPIC_API_KEY, or IMPROVER_AUTH=claude-code to use your Claude login',
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

    const active = await this.em.findOne(ImprovementRun, {
      session: sessionId,
      status: { $in: ['queued', 'running'] },
    });
    if (active) {
      throw new ConflictException('an improvement run is already active for this session');
    }

    try {
      return await this.em.transactional(async (em) => {
        const { revision } = await createRevisionRecords(em, sessionId, dto, 'user', (txEm, rev) =>
          this.evalQueue.enqueue(txEm, rev),
        );
        const run = em.create(ImprovementRun, {
          session: sessionId,
          baseRevision: revision,
          maxIterations: Math.min(
            dto.maxIterations ?? DEFAULT_IMPROVE_ITERATIONS,
            MAX_IMPROVE_ITERATIONS,
          ),
        });
        em.persist(run);
        return run;
      });
    } catch (err) {
      // Either arbiter can fire: the one-active-run partial index (a racing
      // start) or unique (session, revision_number) (a racing submit).
      if (err instanceof UniqueConstraintViolationException) {
        throw new ConflictException('another submission or improvement run raced this one — retry');
      }
      throw err;
    }
  }

  async findOne(id: string): Promise<ImprovementRun> {
    const run = await this.em.findOne(
      ImprovementRun,
      { id },
      { populate: ['session', 'baseRevision', 'bestRevision'] },
    );
    if (!run) {
      throw new NotFoundException(`Improvement run ${id} not found`);
    }
    return run;
  }

  /**
   * Status-guarded update, mirroring the worker's own writes: whichever of
   * cancel/finalize commits first wins, and the loser's write matches zero
   * rows instead of clobbering. Accepted revisions are kept — cancellation
   * stops proposing, it does not undo teaching.
   */
  async cancel(id: string): Promise<ImprovementRun> {
    const changed = await this.em.nativeUpdate(
      ImprovementRun,
      { id, status: { $in: ['queued', 'running'] } },
      { status: 'cancelled', stoppedReason: 'cancelled', updatedAt: new Date() },
    );
    if (changed === 0) {
      // Not found and not-cancellable answer differently: 404 vs 409.
      const run = await this.em.findOne(ImprovementRun, { id });
      if (!run) {
        throw new NotFoundException(`Improvement run ${id} not found`);
      }
      throw new ConflictException(`run is ${run.status} — only queued or running runs cancel`);
    }
    this.em.clear();
    return this.findOne(id);
  }
}
