import {
  MemoryHostRefused,
  type BoundSpace,
  type MemoryClient,
} from '@sysdesign/agentic-memory-client';
import type { MemoryRecordDto, RecordScope } from '@sysdesign/contracts';

import { recallForFields } from '../../adapters/memory-loop/field-recall';
import type { FieldsInput } from '../../core/ports';
import type { MemoryBrainSettings } from '../../settings';
import { sampledIndices } from './replay-fields-measure';

/**
 * The replay's retraction measure: a sample of the records the replay
 * recalled, closed in the tenant replayed against — the one write the replay
 * makes, and only when asked — then read back through `history`, as the owner
 * reads a record's lineage, and the pages that listed each recalled for
 * again, as a session would recall. The acceptance asks that a closed record
 * is recalled by nobody and that its lineage shows the close.
 */

/** Why a record the replay closes was closed: kept on the record, read back by `history`. */
const REPLAY_RETRACTION_REASON = 'retracted by replay-fields';

/** One record the replay recalled: under which scope, and on which pages, so the close is asked under a scope that sees it and the pages are recalled again. */
interface RecalledRecord {
  record: MemoryRecordDto;
  scope: RecordScope;
  pages: { scope: RecordScope; input: FieldsInput }[];
}

export interface RetractionMeasure {
  /** Records closed, drawn evenly across the records the replay recalled. */
  sampled: number;
  /** Of them, how many the pages that listed them recalled again once closed. */
  recalledAfter: number;
  /** Of them, how many `history` shows closed with the reason — the lineage the owner's path reads. */
  lineageShown: number;
  /** Closes and reads the host refused, each named by record. */
  faults: string[];
}

/**
 * Every record the replay recalled, once each by id, with the scope that
 * first recalled it and every page that listed it.
 */
export function recalledRecordsOf(
  pages: readonly { records: readonly MemoryRecordDto[]; scope: RecordScope; input: FieldsInput }[],
): RecalledRecord[] {
  const byId = new Map<string, RecalledRecord>();
  for (const page of pages) {
    for (const record of page.records) {
      const known = byId.get(record.id) ?? { record, scope: page.scope, pages: [] };
      known.pages.push({ scope: page.scope, input: page.input });
      byId.set(record.id, known);
    }
  }
  return [...byId.values()];
}

/** Whether a record's history ends with it closed for the replay's reason. */
const closedForReplay = (versions: readonly MemoryRecordDto[]): boolean => {
  const last = versions.at(-1);
  return (
    last !== undefined &&
    last.status === 'invalidated' &&
    last.closeReason === REPLAY_RETRACTION_REASON
  );
};

export async function measureRetraction(
  memory: Pick<MemoryClient, 'invalidate' | 'history' | 'recall'>,
  bound: BoundSpace,
  settings: MemoryBrainSettings,
  recalled: readonly RecalledRecord[],
  sample: number,
): Promise<RetractionMeasure> {
  const chosen = sampledIndices(recalled.length, sample).flatMap((index) => recalled[index] ?? []);
  const measure: RetractionMeasure = {
    sampled: chosen.length,
    recalledAfter: 0,
    lineageShown: 0,
    faults: [],
  };
  const closed = new Set<string>();
  for (const { record, scope } of chosen) {
    try {
      await memory.invalidate(bound.spaceId, {
        recordId: record.id,
        scope,
        reason: REPLAY_RETRACTION_REASON,
      });
      closed.add(record.id);
      const versions = await memory.history(bound.spaceId, { recordId: record.id, scope });
      if (closedForReplay(versions)) measure.lineageShown += 1;
    } catch (error) {
      if (!(error instanceof MemoryHostRefused)) throw error;
      measure.faults.push(`${record.id}: ${error.message}`);
    }
  }
  // Each page that listed a closed record, recalled for once more; a closed record among what comes back is the count the acceptance reads.
  const pages = new Map<FieldsInput, RecordScope>();
  for (const { record, pages: listedOn } of chosen) {
    if (!closed.has(record.id)) continue;
    for (const page of listedOn) pages.set(page.input, page.scope);
  }
  const recalledAgain = new Set<string>();
  for (const [input, scope] of pages) {
    const { records } = await recallForFields(memory, bound, settings, scope, input);
    for (const record of records) if (closed.has(record.id)) recalledAgain.add(record.id);
  }
  measure.recalledAfter = recalledAgain.size;
  return measure;
}
