/**
 * Row ⇄ `OrchestrationRunDto`, pure. The step ledger and the context are
 * jsonb as-is; the children are rows the dto carries as step run ids, one per
 * id a step opened, in the order it opened them.
 */
import type { OrchestrationRunDto } from '@sysdesign/contracts';
import type { OrchestrationRun } from '@sysdesign/db';

import { toDate, toDateOrNull, toIso, toIsoOrNull } from '../../runs/persistence/conventions';

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

export interface ChildRef {
  step: string;
  /** The child's position among the step's children, from zero. */
  ordinal: number;
  runId: string;
}

/** Every child run every step opened, in ledger order. */
export const childrenOf = (record: OrchestrationRunDto): ChildRef[] =>
  Object.entries(record.steps).flatMap(([step, dto]) =>
    dto.runIds.map((runId, ordinal) => ({ step, ordinal, runId })),
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
    startedAt: toDate(record.startedAt),
    finishedAt: toDateOrNull(record.finishedAt),
  };
}

export function fromRow(row: OrchestrationRun): OrchestrationRunDto {
  return {
    orchestrationRunId: row.id,
    orchestrator: row.orchestrator,
    pipeline: row.pipeline,
    status: row.status,
    startedAt: toIso(row.startedAt),
    finishedAt: toIsoOrNull(row.finishedAt),
    // Rows written before a run could carry its rubric have no flag: it was derived.
    request: {
      ...row.request,
      criteriaProvided: row.request.criteriaProvided ?? false,
      adoptedFrom: row.request.adoptedFrom ?? null,
    },
    context: row.context,
    steps: row.steps,
    error: row.error,
  };
}
