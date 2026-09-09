/**
 * Row ⇄ `OrchestrationRunDto`, pure. The step ledger and the context are
 * jsonb as-is; the children are rows the dto carries as step run ids.
 */
import type { OrchestrationRunDto } from '@sysdesign/contracts';
import type { OrchestrationRun } from '@sysdesign/db';

export interface OrchestrationRunRow {
  id: string;
  orchestrator: string;
  pipeline: string | null;
  status: OrchestrationRunDto['status'];
  request: OrchestrationRunDto['request'];
  context: OrchestrationRunDto['context'];
  steps: OrchestrationRunDto['steps'];
  error: OrchestrationRunDto['error'];
  startedAt: Date;
  finishedAt: Date | null;
}

/** Every step that has a child run, in ledger order. */
export const childrenOf = (record: OrchestrationRunDto): { step: string; runId: string }[] =>
  Object.entries(record.steps).flatMap(([step, dto]) =>
    dto.runId === null ? [] : [{ step, runId: dto.runId }],
  );

export function toRow(record: OrchestrationRunDto): OrchestrationRunRow {
  return {
    id: record.orchestrationRunId,
    orchestrator: record.orchestrator,
    pipeline: record.pipeline,
    status: record.status,
    request: record.request,
    context: record.context,
    steps: record.steps,
    error: record.error,
    startedAt: new Date(record.startedAt),
    finishedAt: record.finishedAt === null ? null : new Date(record.finishedAt),
  };
}

export function fromRow(row: OrchestrationRun): OrchestrationRunDto {
  return {
    orchestrationRunId: row.id,
    orchestrator: row.orchestrator,
    pipeline: row.pipeline,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt === null ? null : row.finishedAt.toISOString(),
    request: row.request,
    context: row.context,
    steps: row.steps,
    error: row.error,
  };
}
