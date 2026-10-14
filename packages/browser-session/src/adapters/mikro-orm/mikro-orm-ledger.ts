import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  INTERRUPTED,
  INTERRUPTED_STATUS,
  interruptedDetail,
  type BrowserDecisionDto,
  type BrowserSessionDetailDto,
  type BrowserSessionDto,
  type BrowserTaskDto,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import { BrowserDecision, BrowserSession, BrowserTask } from '@sysdesign/db';

import type {
  LedgerPort,
  NewDecision,
  NewSession,
  NewTask,
  SessionClose,
  TaskClose,
} from '../../core/ports';
import { causeOf } from '../../core/ports';

/**
 * The records in Postgres. Every write runs on a fork of its own: the writes
 * arrive from the engine's queue, outside any request, one after another,
 * and none may share an identity map with the next. Ids come from the
 * engine, so a write never has to answer with one.
 */
const iso = (at: Date): string => at.toISOString();
const isoOrNull = (at: Date | null): string | null => (at === null ? null : iso(at));

export const toSessionDto = (row: BrowserSession): BrowserSessionDto => ({
  id: row.id,
  dumpRunId: row.dumpRunId,
  goalPath: row.goalPath,
  goalHash: row.goalHash,
  profile: row.profile,
  subject: row.subject,
  headed: row.headed,
  status: row.status,
  terminationReason: row.terminationReason,
  terminationCause: row.terminationCause,
  terminationDetail: row.terminationDetail,
  // A session recorded before the target existed has none in its stored rails.
  limits: { ...row.limits, targetDone: row.limits.targetDone ?? null },
  steps: row.steps,
  startedAt: iso(row.startedAt),
  heartbeatAt: iso(row.heartbeatAt),
  finishedAt: isoOrNull(row.finishedAt),
  error: row.error,
});

export const toTaskDto = (row: BrowserTask): BrowserTaskDto => ({
  id: row.id,
  sessionId: row.session.id,
  ordinal: row.ordinal,
  label: row.label,
  externalRef: row.externalRef,
  facets: row.facets,
  status: row.status,
  outcome: row.outcome,
  startStep: row.startStep,
  endStep: row.endStep,
  startedAt: iso(row.startedAt),
  finishedAt: isoOrNull(row.finishedAt),
});

export const toDecisionDto = (row: BrowserDecision): BrowserDecisionDto => ({
  id: row.id,
  sessionId: row.session.id,
  taskId: row.task === null ? null : row.task.id,
  step: row.step,
  ordinal: row.ordinal,
  kind: row.kind,
  source: row.source,
  loopRunId: row.loopRunId,
  loopOrchestrationId: row.loopOrchestrationId,
  teachOrchestrationId: row.teachOrchestrationId,
  ref: row.ref,
  question: row.question,
  answer: row.answer,
  rests: row.rests,
  payload: row.payload,
  durationMs: row.durationMs,
  createdAt: iso(row.createdAt),
});

@Injectable()
export class MikroOrmLedger implements LedgerPort {
  constructor(private readonly em: EntityManager) {}

  async openSession(session: NewSession): Promise<void> {
    const em = this.em.fork();
    em.create(BrowserSession, {
      id: session.id,
      dumpRunId: session.dumpRunId,
      goalPath: session.goalPath,
      goalHash: session.goalHash,
      goalMarkdown: session.goalMarkdown,
      profile: session.profile,
      subject: session.subject,
      headed: session.headed,
      limits: session.limits,
      criteria: null,
      startedAt: session.startedAt,
      heartbeatAt: session.startedAt,
    });
    await em.flush();
  }

  async recordCriteria(
    sessionId: string,
    criteria: Record<string, SuccessCriterion[]>,
  ): Promise<void> {
    await this.em.fork().nativeUpdate(BrowserSession, { id: sessionId }, { criteria });
  }

  async heartbeat(sessionId: string, at: Date, steps: number): Promise<void> {
    await this.em
      .fork()
      .nativeUpdate(BrowserSession, { id: sessionId }, { heartbeatAt: at, steps });
  }

  async openTask(task: NewTask): Promise<void> {
    const em = this.em.fork();
    em.create(BrowserTask, {
      id: task.id,
      session: em.getReference(BrowserSession, task.sessionId),
      ordinal: task.ordinal,
      label: task.label,
      externalRef: task.externalRef,
      facets: [...task.facets],
      startStep: task.startStep,
      startedAt: task.startedAt,
    });
    await em.flush();
  }

  async closeTask(taskId: string, close: TaskClose): Promise<void> {
    await this.em.fork().nativeUpdate(
      BrowserTask,
      { id: taskId },
      {
        status: close.status,
        outcome: close.outcome,
        endStep: close.endStep,
        finishedAt: close.finishedAt,
      },
    );
  }

  async recordDecision(decision: NewDecision): Promise<void> {
    const em = this.em.fork();
    em.create(BrowserDecision, {
      id: decision.id,
      session: em.getReference(BrowserSession, decision.sessionId),
      task: decision.taskId === null ? null : em.getReference(BrowserTask, decision.taskId),
      step: decision.step,
      ordinal: decision.ordinal,
      kind: decision.kind,
      source: decision.source,
      loopRunId: decision.loopRunId,
      loopOrchestrationId: decision.loopOrchestrationId,
      ref: decision.ref,
      question: decision.question,
      answer: decision.answer,
      rests: decision.rests,
      payload: decision.payload,
      durationMs: decision.durationMs,
      createdAt: decision.createdAt,
    });
    await em.flush();
  }

  async recordTeaching(decisionIds: readonly string[], orchestrationRunId: string): Promise<void> {
    if (decisionIds.length === 0) return;
    await this.em
      .fork()
      .nativeUpdate(
        BrowserDecision,
        { id: { $in: [...decisionIds] } },
        { teachOrchestrationId: orchestrationRunId },
      );
  }

  async failStale(before: Date): Promise<number> {
    const em = this.em.fork();
    const stale = await em.find(BrowserSession, {
      status: 'running',
      heartbeatAt: { $lt: before },
    });
    for (const row of stale) {
      row.status = INTERRUPTED_STATUS;
      row.terminationReason = INTERRUPTED;
      row.terminationDetail = interruptedDetail(iso(row.heartbeatAt));
      // Finished when it was last known alive: what ended it, and when, nobody saw.
      row.finishedAt = row.heartbeatAt;
    }
    await em.flush();
    return stale.length;
  }

  async closeSession(sessionId: string, close: SessionClose): Promise<void> {
    await this.em.fork().nativeUpdate(
      BrowserSession,
      { id: sessionId },
      {
        status: close.status,
        terminationReason: close.termination.reason,
        terminationCause: causeOf(close.termination),
        terminationDetail: close.termination.detail,
        steps: close.steps,
        finishedAt: close.finishedAt,
        heartbeatAt: close.finishedAt,
        error: close.error,
      },
    );
  }

  async listSessions(limit: number): Promise<BrowserSessionDto[]> {
    const rows = await this.em
      .fork()
      .find(BrowserSession, {}, { orderBy: { startedAt: 'desc' }, limit });
    return rows.map(toSessionDto);
  }

  async getSession(id: string): Promise<BrowserSessionDetailDto | null> {
    const em = this.em.fork();
    const session = await em.findOne(BrowserSession, { id });
    if (session === null) return null;
    const [tasks, decisions] = await Promise.all([
      em.find(BrowserTask, { session: id }, { orderBy: { ordinal: 'asc' } }),
      em.find(BrowserDecision, { session: id }, { orderBy: { step: 'asc', ordinal: 'asc' } }),
    ]);
    return {
      ...toSessionDto(session),
      tasks: tasks.map(toTaskDto),
      decisions: decisions.map(toDecisionDto),
    };
  }
}
