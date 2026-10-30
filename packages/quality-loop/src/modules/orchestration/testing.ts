/**
 * What the orchestration suites share: the canned model answers — one per
 * pipeline per stage, in the order `fakeLlm` tries them; every pipeline's
 * criteria, artifact and evaluation schemas differ in their enums, so nothing
 * cross-matches — and the poll that waits for an orchestration to settle.
 * Pure helpers only — no vitest imports.
 */
import type { OrchestrationRunDto } from '@sysdesign/contracts';

import { getJson, type Envelope } from '../http/testing';

const result = (criterionId: string, locationRefs: string[]) => ({
  criterionId,
  result: 'pass',
  confidence: 'high',
  locationRefs,
  rationale: 'shown by a named mechanism',
});

export const CANNED: readonly unknown[] = [
  {
    criteria: [
      { kind: 'functional', statement: 'List orders newest first.' },
      { kind: 'functional', statement: 'Show each order status.' },
    ],
  },
  {
    criteria: [
      { kind: 'need', statement: 'Evidence on serving a list from an unreliable upstream.' },
    ],
  },
  { criteria: [{ kind: 'signal', statement: 'Accounts for r1 and r2 passing at i1.' }] },
  {
    summary: 'A read-optimised history service fed from a store the page owns.',
    assumptions: [],
    components: [{ name: 'History API', responsibility: 'serves the list', technology: null }],
    flows: [{ name: 'view history', steps: ['History API'] }],
    dataModel: [],
    tradeoffs: [],
    risks: [],
    capacity: [],
  },
  {
    summary: 'Two lessons from an earlier order-history run; both bear on the read path.',
    kept: [
      {
        chunk: 'm1',
        serves: 'the list read',
        cites: [],
        insight: 'serve the list from a store the page owns',
        caveat: null,
      },
      {
        chunk: 'm2',
        serves: 'order status',
        cites: [],
        insight: 'record each status transition as a row',
        caveat: null,
      },
    ],
    dropped: [],
    gaps: [],
  },
  {
    summary: 'Both criteria passed at the first iteration; the design owned its read store.',
    memories: [
      {
        evidence: ['r1'],
        insight:
          'Serve the list from a store the page owns, never from the POS on the request path.',
        appliesWhen: 'a read path depends on an upstream that may be down',
      },
      {
        evidence: ['r2'],
        insight: 'Record each order status transition as its own row.',
        appliesWhen: 'a status must be shown per channel or per step',
      },
    ],
    unused: [],
  },
  {
    findings: [
      {
        type: 'irrelevant_chunk',
        severity: 'medium',
        confidence: 'high',
        fixability: 'fixable_local',
        locationRefs: ['m2'],
        criterionIds: [],
        rationale: 'status rows inform no need of this query',
      },
    ],
  },
  { findings: [] },
  { results: [result('c1', ['component.1']), result('c2', ['flow.1'])], advisoryVerdict: null },
  { results: [result('c1', ['m1'])], advisoryVerdict: null },
  { results: [result('c1', ['memory.1'])], advisoryVerdict: null },
];

/** Three chained runs even with a fake model take a while under a loaded CI box: a deadline, not a count. */
const SETTLE_DEADLINE_MS = 120_000;
const SETTLE_INTERVAL_MS = 50;

/** The orchestration once it is no longer running, polled until then. */
export async function settledOrchestration(url: string, id: string): Promise<OrchestrationRunDto> {
  let record: OrchestrationRunDto | null = null;
  for (
    const deadline = Date.now() + SETTLE_DEADLINE_MS;
    Date.now() < deadline && record?.status !== 'complete' && record?.status !== 'failed';
  ) {
    record = (await getJson<Envelope<OrchestrationRunDto>>(url, `/orchestrations/${id}`)).data;
    if (record.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
    }
  }
  if (!record) throw new Error('the orchestration run was never observed');
  return record;
}
