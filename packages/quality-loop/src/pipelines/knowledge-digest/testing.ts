/**
 * Builders the knowledge-digest specs share: the source pipeline's policy as the
 * record carries it, what a recall hands over, the digest a producer answers
 * with, and a record whose every field sits at its cap. The run they are about
 * is `core/testing`', because both digests reduce a run the same way. Pure
 * helpers only — no vitest imports.
 */
import { fill } from '../../core/testing';
import {
  ALIAS_MAX,
  KEY_MAX,
  LENS_MAX,
  MAX_CRITERIA_ITEMS,
  MAX_FINDING_CRITERIA,
  MAX_FINDING_LENSES,
  MAX_FINDING_REFS,
  MAX_FINDINGS,
  RATIONALE_MAX,
  REF_MAX,
  STATEMENT_MAX,
  TRANSITION_DETAIL_MAX,
  type RecordedCriterion,
  type RecordedFinding,
} from '../../core/outputs';
import type { RecalledItem, SourcePolicy } from './from-run';
import {
  DIMENSION_MAX,
  KNOWLEDGE_RULES,
  KNOWN_TEXT_MAX,
  MAX_ITEMS,
  MAX_KNOWN,
  MAX_LOCATION_IDS,
  alias,
  type KnowledgeRecord,
} from './input';
import type { KnowledgeDigest } from './output';

/**
 * A distinct string of exactly `length` characters. `fill` repeats its
 * character, so `fill(40, '12')` is eighty characters rather than forty — and
 * this record's caps are exercised past index nine.
 */
const distinct = (length: number, index: number): string => {
  const tag = String(index);
  return `${fill(length - tag.length)}${tag}`;
};

/**
 * The source pipeline as the record carries it: `system-design`'s own policy
 * map, reduced to the question the digest asks — which dimension does a
 * criterion of this kind, or a finding of this type, land on.
 */
export const sampleSource = (overrides: Partial<SourcePolicy> = {}): SourcePolicy => ({
  pipeline: 'system-design',
  version: '1.0.0',
  dimensions: ['completeness', 'soundness', 'compliance'],
  map: {
    criterionKinds: { functional: 'completeness', constraint: 'compliance' },
    findingTypes: { unhandled_failure: 'soundness', contradiction: 'soundness' },
  },
  ...overrides,
});

/** What a recall hands over: a stored lesson about a situation like the sample run's. */
export const sampleKnown = (overrides: Partial<RecalledItem> = {}): RecalledItem => ({
  kind: 'lesson',
  runId: '2026-09-08T06-53-32-552-09ea0f-quality',
  ref: 'memory.2',
  pipeline: 'system-design',
  when: '2026-09-08',
  text: 'Give every read path that depends on an upstream a story for that upstream being down — applies when a functional requirement is served from data an unreliable system provides.',
  ...overrides,
});

export const sampleDigest = (overrides: Partial<KnowledgeDigest> = {}): KnowledgeDigest => ({
  summary:
    'The run confirms what the store already held about upstream outages, and adds the repair that closed it.',
  memories: [
    {
      kind: 'procedure',
      evidence: ['f1', 'r1'],
      insight:
        'Name a durable queue between an unreliable upstream and the read path, and the read path stops depending on the upstream being up.',
      appliesWhen: 'a functional requirement is served from data an unreliable system provides',
      dimension: 'soundness',
      topics: ['upstream-outage', 'durable-queue'],
      confirms: ['k1'],
      contradicts: [],
    },
  ],
  unused: ['f2', 'r2'],
  ...overrides,
});

const maximalFinding = (position: number): RecordedFinding => ({
  alias: `f${position + 1}`,
  key: fill(KEY_MAX),
  type: fill(60),
  severity: 'critical',
  confidence: 'medium',
  fixability: 'fixable_local',
  locationRefs: Array.from({ length: MAX_FINDING_REFS }, () => fill(REF_MAX)),
  criteria: Array.from({ length: MAX_FINDING_CRITERIA }, () => fill(ALIAS_MAX)),
  lenses: Array.from({ length: MAX_FINDING_LENSES }, () => fill(LENS_MAX)),
  iterations: Array.from({ length: 10 }, (_, index) => index + 1),
  rationale: fill(RATIONALE_MAX),
  remediated: true,
  reconciledTo: fill(ALIAS_MAX),
  transitions: Array.from({ length: 10 }, () => ({
    kind: 'persisted' as const,
    iterations: [1, 2],
    detail: fill(TRANSITION_DETAIL_MAX),
  })),
  // The longer line: an adopted finding renders its provenance too.
  adopted: true,
});

const maximalCriterion = (position: number): RecordedCriterion => ({
  alias: `r${position + 1}`,
  id: fill(20),
  kind: fill(60),
  statement: fill(STATEMENT_MAX),
  results: Array.from({ length: 10 }, (_, index) => ({
    iteration: index + 1,
    result: 'partial' as const,
  })),
  transitions: Array.from({ length: 10 }, () => ({
    kind: 'improved' as const,
    iterations: [1, 2],
    detail: fill(TRANSITION_DETAIL_MAX),
  })),
});

/** Every field at its cap, the known section included: the render of this must fit the goal budget. */
export const maximalRecord = (): KnowledgeRecord => ({
  runId: fill(80),
  pipeline: fill(120),
  finalDecision: 'escalate',
  stopReason: 'max-iterations',
  bestIteration: 10,
  prompt: fill(12_000),
  artifact: fill(16_000),
  iterations: Array.from({ length: 10 }, (_, index) => ({
    iteration: index + 1,
    mode: 'revise' as const,
    decision: 'revise' as const,
    reason: fill(200),
    overall: 55.5,
    overallDelta: -10.5,
    dimensions: Object.fromEntries(Array.from({ length: 8 }, (_, d) => [distinct(40, d), 55.5])),
    dimensionDeltas: Object.fromEntries(
      Array.from({ length: 8 }, (_, d) => [distinct(40, d), -10.5]),
    ),
  })),
  criteria: Array.from({ length: MAX_CRITERIA_ITEMS }, (_, index) => maximalCriterion(index)),
  findings: Array.from({ length: MAX_FINDINGS }, (_, index) => maximalFinding(index)),
  omitted: { findings: 99, criteria: 99, adopted: 99, locations: 99 },
  source: { pipeline: fill(80), version: fill(40) },
  dimensions: Array.from({ length: 8 }, (_, index) => distinct(DIMENSION_MAX, index)),
  dimensionMap: {
    criterionKinds: Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [distinct(60, index), fill(DIMENSION_MAX)]),
    ),
    findingTypes: Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [distinct(60, index), fill(DIMENSION_MAX)]),
    ),
  },
  known: Array.from({ length: MAX_KNOWN }, (_, index) => ({
    alias: alias(index),
    kind: fill(40),
    runId: fill(80),
    ref: fill(200),
    pipeline: fill(80),
    when: fill(40),
    text: fill(KNOWN_TEXT_MAX),
  })),
  locationIds: Array.from({ length: MAX_LOCATION_IDS }, (_, index) => distinct(REF_MAX, index)),
  rules: [...KNOWLEDGE_RULES],
  maxMemories: MAX_ITEMS,
});
