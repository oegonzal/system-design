import type { BoundSpace, MemoryClient } from '@sysdesign/agentic-memory-client';
import {
  dealByRank,
  evidenceAlias,
  evidenceText,
  fieldProbes,
  hitsFor,
  type EvidenceItem,
  type MemoryRecordDto,
  type RecalledRecordDto,
  type RecallResultDto,
  type RecordScope,
} from '@sysdesign/contracts';

import type { FieldsInput, RecallReport } from '../../core/ports';
import type { MemoryBrainSettings } from '../../settings';

/**
 * A form page's evidence recalled from the space: one request per distinct
 * question the page asks (`fieldQuestionOf`, through the contracts' probe
 * set), by the question's text alone — the semantic kind's exact key is the
 * subject, which every taught answer shares, so a key would find them all —
 * over the registers the facts roles name, as many at once as the settings
 * allow. Each field takes as many of its question's hits as the declared table
 * gives its kind of control; the fields' lists are dealt by rank under the
 * declared cap, one slot per record, and become the goal's evidence items,
 * each naming the register it is of, where it holds, the day it held from and
 * the record that holds it — declared facts of the record, never a reading of
 * its text. The dealing is the contracts' (`field-goal-evidence.ts`), shared
 * with the loop's own recall, so the two recalls deal alike.
 */

export interface FieldRecall {
  evidence: EvidenceItem[];
  /**
   * The record behind each item, in the items' order — the scope the host
   * answered it under, the identity it is kept by — for whoever measures the
   * recall on the records' own facts; the goal lists the items alone.
   */
  records: MemoryRecordDto[];
  report: RecallReport;
}

/** The registers the facts roles name, in the legend's order: what every recall searches. */
const factsRegistersOf = (bound: BoundSpace, settings: MemoryBrainSettings): string[] =>
  settings.facts.flatMap((role) => bound.registers[role] ?? []);

/**
 * Each item mapped, at most `limit` in flight at once, in the items' order.
 * Once one call fails nothing further is started — a host that is down is
 * asked by the calls already in flight, not by every question of the page —
 * and the first failure is the result.
 */
async function mapConcurrently<Item, Result>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = [];
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (next < items.length && !failed) {
      const index = next;
      next += 1;
      try {
        results[index] = await work(items[index] as Item);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Where a record came from, as the one token an evidence line's tail is read
 * back by: a source named with spaces has each written percent-encoded, so it
 * reads back whole. Measured 2026-11-06: five records carried into the store
 * named their source by a document's title — "document-digest:Operator
 * guidance — session …" — and the first one recalled stopped a session on a
 * form it had just filled.
 */
const originToken = (source: string): string =>
  source.trim().replace(/\s/g, (space) => encodeURIComponent(space));

/**
 * One recalled record as the goal lists it. The scope is read off the record's
 * own scope: one written under the binding's unit key holds of that unit of
 * work, any other of the subject. The source names the program that wrote it
 * and the record with its version, so a reader finds it again or retracts it.
 */
const evidenceOf = (
  bound: BoundSpace,
  record: MemoryRecordDto,
  position: number,
): EvidenceItem => ({
  alias: evidenceAlias(position),
  text: evidenceText(record.text),
  when: record.validFrom.slice(0, 'YYYY-MM-DD'.length),
  scope: bound.scope.unit !== null && bound.scope.unit in record.scope ? 'unit' : 'subject',
  kind: record.register,
  source: { origin: originToken(record.provenance.source), ref: `${record.id}@v${record.version}` },
});

/** The routes the host passed over, each reason once, in the host's declared words. */
const skippedRoutes = (results: readonly RecallResultDto[]): string[] => [
  ...new Set(
    results.flatMap((result) =>
      result.routes.flatMap((route) => (route.skipped === null ? [] : [route.skipped])),
    ),
  ),
];

/**
 * A page recalled for by nobody: no evidence, no request, and the outage on
 * the report — the one shape every reader of the recall gets for a host that
 * did not answer, whether the brain rode the silence out or a replay did.
 */
export const noEvidence = (fault: string, latencyMs: number): FieldRecall => ({
  evidence: [],
  records: [],
  report: { requests: 0, evidence: 0, latencyMs, fault, skipped: [] },
});

/**
 * The evidence for one page, under one scope, and the report of how it was
 * got. A host that does not answer, or refuses, throws as the client does: the
 * brain decides what a fault means for the page.
 */
export async function recallForFields(
  client: Pick<MemoryClient, 'recall'>,
  bound: BoundSpace,
  settings: MemoryBrainSettings,
  scope: RecordScope,
  input: FieldsInput,
): Promise<FieldRecall> {
  const { hitsPerFieldType, maxEvidence, concurrency } = settings.recall;
  const startedAt = Date.now();
  const probes = fieldProbes(input.fields, hitsPerFieldType);
  const registers = factsRegistersOf(bound, settings);
  const results = await mapConcurrently(probes.texts, concurrency, (text) =>
    client.recall(bound.spaceId, { scope, text, registers }),
  );
  const perField = input.fields.map((field, position): RecalledRecordDto[] => {
    const probe = probes.byField[position];
    if (probe === null || probe === undefined) return [];
    return (results[probe]?.items ?? []).slice(0, hitsFor(field, hitsPerFieldType));
  });
  const dealt = dealByRank(perField, (item) => item.record.id, maxEvidence);
  return {
    evidence: dealt.map((item, position) => evidenceOf(bound, item.record, position)),
    records: dealt.map((item) => item.record),
    report: {
      requests: probes.texts.length,
      evidence: dealt.length,
      latencyMs: Date.now() - startedAt,
      fault: null,
      skipped: skippedRoutes(results),
    },
  };
}
