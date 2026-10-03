/**
 * Builders the memory-recall specs share. Pure helpers only — no vitest
 * imports — so the file compiles under the app tsconfig.
 */
import { MAX_QUALITY_RUN_ITERATIONS, modelSchema, type BoundPath } from '@sysdesign/contracts';

import {
  focusAlias,
  MAX_FOCUS,
  MAX_KEPT,
  MAX_PROBES,
  memoryQuerySchema,
  probeAlias,
  RECALL_RULES,
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
  focus: [],
  known: [],
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

const ADMITTED = modelSchema(memoryQuerySchema).bounds;

/** The most the curator's schema admits at a path: a count, or a length in characters. */
export const admitted = (path: BoundPath): number => {
  const declared = ADMITTED[path];
  if (declared === undefined) throw new Error(`the memory query declares no bound at ${path}`);
  return declared.ceiling;
};

/**
 * Every field at the most the schema admits — every bound there being exact
 * and sized to what its writer can hand over, that is the most a store, a
 * probe deriver and an orchestrator can put in a query — and every
 * candidate's text `lesson` characters: by default the longest lesson the
 * store holds.
 */
export const maximalQuery = (lesson = admitted('candidates[].text')): MemoryQuery => ({
  query: fill(admitted('query')),
  rules: Array.from({ length: admitted('rules') }, () => fill(admitted('rules[]'))),
  focus: Array.from({ length: admitted('focus') }, () => fill(admitted('focus[]'))),
  known: Array.from({ length: admitted('known') }, () => fill(admitted('known[]'))),
  probes: Array.from({ length: admitted('probes') }, () => fill(admitted('probes[]'))),
  maxKept: MAX_KEPT,
  candidates: Array.from({ length: admitted('candidates') }, () => ({
    text: fill(lesson),
    origin: 'other-pipeline' as const,
    source: source({
      runId: fill(admitted('candidates[].source.runId')),
      pipeline: fill(admitted('candidates[].source.pipeline')),
      ref: fill(admitted('candidates[].source.ref')),
      when: fill(admitted('candidates[].source.when')),
      iteration: MAX_QUALITY_RUN_ITERATIONS,
    }),
    matched: [
      ...Array.from({ length: MAX_FOCUS }, (_, index) => focusAlias(index)),
      ...Array.from({ length: MAX_PROBES }, (_, index) => probeAlias(index)),
    ],
  })),
});
