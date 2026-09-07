/**
 * Row ⇄ `MemoryRunDto`, pure. The step ledger and the availability snapshots
 * are jsonb as-is; the child runs are references the dto carries as ids.
 */
import type { MemoryRunDto } from '@sysdesign/contracts';
import type { MemoryRun } from '@sysdesign/db';

export interface MemoryRunRow {
  id: string;
  pipeline: string;
  status: MemoryRunDto['status'];
  request: MemoryRunDto['request'];
  embedding: MemoryRunDto['embedding'];
  store: MemoryRunDto['store'];
  steps: MemoryRunDto['steps'];
  recallRun: string | null;
  targetRun: string | null;
  digestRun: string | null;
  error: MemoryRunDto['error'];
  startedAt: Date;
  finishedAt: Date | null;
}

export const childIds = (
  record: MemoryRunDto,
): Pick<MemoryRunRow, 'recallRun' | 'targetRun' | 'digestRun'> => ({
  recallRun: record.steps.recall.runId,
  targetRun: record.steps.target.runId,
  digestRun: record.steps.digest.runId,
});

export function toRow(record: MemoryRunDto): MemoryRunRow {
  return {
    id: record.memoryRunId,
    pipeline: record.pipeline,
    status: record.status,
    request: record.request,
    embedding: record.embedding,
    store: record.store,
    steps: record.steps,
    ...childIds(record),
    error: record.error,
    startedAt: new Date(record.startedAt),
    finishedAt: record.finishedAt === null ? null : new Date(record.finishedAt),
  };
}

export function fromRow(row: MemoryRun): MemoryRunDto {
  return {
    memoryRunId: row.id,
    pipeline: row.pipeline,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt === null ? null : row.finishedAt.toISOString(),
    request: row.request,
    embedding: row.embedding,
    store: row.store,
    steps: row.steps,
    error: row.error,
  };
}
