/**
 * Builders the experience-digest specs share: the digest a producer answers
 * with, and a record whose every field sits at its cap. The run they are about
 * is `core/testing`', because both digests reduce a run the same way. Pure
 * helpers only — no vitest imports.
 */
import { findingKey } from '../../core/evidence/identity';
import { fill } from '../../core/testing';
import {
  ALIAS_MAX,
  LENS_MAX,
  MAX_CRITERIA_ITEMS,
  MAX_FINDING_CRITERIA,
  MAX_FINDING_LENSES,
  MAX_FINDING_REFS,
  MAX_FINDINGS,
  MAX_MEMORIES,
  RATIONALE_MAX,
  REF_MAX,
  STATEMENT_MAX,
  TRANSITION_DETAIL_MAX,
  type ExperienceRecord,
  type RecordedCriterion,
  type RecordedFinding,
} from './input';
import type { ExperienceDigest } from './output';

export {
  PERSISTED_KEY,
  RESOLVED_KEY,
  sampleIterations,
  sampleRun,
  sampleTrace,
} from '../../core/testing';

export const sampleDigest = (overrides: Partial<ExperienceDigest> = {}): ExperienceDigest => ({
  summary:
    'The loop accepted once the read path handled a POS outage; a contradiction it could not fix stayed.',
  memories: [
    {
      evidence: ['f1', 'r1'],
      insight:
        'Give every read path that depends on an upstream a story for that upstream being down.',
      appliesWhen: 'a functional requirement is served from data an unreliable system provides',
    },
  ],
  unused: ['f2', 'r2'],
  ...overrides,
});

const maximalRefs = Array.from(
  { length: MAX_FINDING_REFS },
  (_, index) => `${fill(REF_MAX - 2)}${String(index).padStart(2, '0')}`,
);

const maximalFinding = (position: number): RecordedFinding => ({
  alias: `f${position + 1}`,
  key: findingKey(fill(60), maximalRefs),
  type: fill(60),
  severity: 'critical',
  confidence: 'medium',
  fixability: 'fixable_local',
  locationRefs: maximalRefs,
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

/** Every field at its cap: the render of this must stay under the goal budget. */
export const maximalRecord = (): ExperienceRecord => ({
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
    dimensions: Object.fromEntries(
      Array.from({ length: 8 }, (_, d) => [fill(40, String(d)), 55.5]),
    ),
    dimensionDeltas: Object.fromEntries(
      Array.from({ length: 8 }, (_, d) => [fill(40, String(d)), -10.5]),
    ),
  })),
  criteria: Array.from({ length: MAX_CRITERIA_ITEMS }, (_, index) => maximalCriterion(index)),
  findings: Array.from({ length: MAX_FINDINGS }, (_, index) => maximalFinding(index)),
  omitted: { findings: 99, criteria: 99, adopted: 99 },
  rules: Array.from({ length: 8 }, () => fill(300)),
  maxMemories: MAX_MEMORIES,
});
