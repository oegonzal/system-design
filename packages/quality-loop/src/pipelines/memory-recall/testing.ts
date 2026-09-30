/**
 * Builders the memory-recall specs share. Pure helpers only — no vitest
 * imports — so the file compiles under the app tsconfig.
 */
import {
  RECALL_RULES,
  MAX_CANDIDATES,
  MAX_KEPT,
  type ChunkSource,
  type MemoryQuery,
} from './input';
import { fill } from '../../core/testing';
import type { MemoryPack } from './output';

const source = (overrides: Partial<ChunkSource> = {}): ChunkSource => ({
  runId: '2026-09-06T22-43-36-266-a874eb-quality',
  pipeline: 'system-design',
  kind: 'finding',
  ref: 'unhandled_failure|flow.1',
  decision: 'revise',
  iteration: 1,
  when: '2026-09-06',
  ...overrides,
});

export const sampleQuery = (overrides: Partial<MemoryQuery> = {}): MemoryQuery => ({
  query: [
    '# Prompt — Serve an order history',
    '',
    '## Scenario',
    '',
    "A storefront lists each customer's past orders, merged from a POS that sends nothing.",
    '',
    '## Functional requirements',
    '',
    '1. List orders newest first.',
    '',
    '## Scale targets',
    '',
    '| Metric | Target |',
    '| --- | --- |',
    '| Reads/s | 150 |',
  ].join('\n'),
  rules: [...RECALL_RULES],
  probes: ['a read path depends on one upstream that can go down'],
  maxKept: 2,
  candidates: [
    {
      text: 'The list read path served every request from the order store, so a POS outage took the page down.',
      source: source(),
      matched: ['p1'],
    },
    {
      text: '[component.2] Order store — holds merged orders (Postgres)',
      source: source({ kind: 'section', ref: 'component.2', decision: 'accept', iteration: 2 }),
      matched: [],
    },
    {
      text: 'A notification fan-out must dedupe by event id before delivery.',
      source: source({
        runId: '2026-09-05T10-00-00-000-0f0f0f-quality',
        kind: 'lesson',
        ref: 'resolved:missing_requirement|flow.2',
        decision: 'accept',
        iteration: 3,
      }),
      matched: [],
    },
  ],
  ...overrides,
});

export const samplePack = (overrides: Partial<MemoryPack> = {}): MemoryPack => ({
  summary:
    'The query needs a resilient read path; two candidates speak to it and one is unrelated.',
  kept: [
    {
      chunk: 'm1',
      serves: 'availability of the list read',
      insight: 'a read path with a single store behind it went down with the POS',
      caveat: null,
    },
    {
      chunk: 'm2',
      serves: 'the data model',
      insight: 'an order store that holds merged orders',
      caveat: 'from an accepted iteration of a different prompt',
    },
  ],
  dropped: [{ chunk: 'm3', reason: 'about notification fan-out, not order history' }],
  gaps: ['nothing recalled covers the 150 reads/s target'],
  ...overrides,
});

/** Every field at its cap: the render of this must stay under the goal budget. */
export const maximalQuery = (): MemoryQuery => ({
  query: fill(16_000),
  rules: Array.from({ length: 8 }, () => fill(300)),
  probes: Array.from({ length: 6 }, () => fill(240)),
  maxKept: MAX_KEPT,
  candidates: Array.from({ length: MAX_CANDIDATES }, () => ({
    text: fill(1_200),
    source: source({ runId: fill(80), pipeline: fill(80), ref: fill(200), when: fill(40) }),
    matched: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
  })),
});
