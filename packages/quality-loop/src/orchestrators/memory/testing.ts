/**
 * Builders the memory read-out specs share: a goal, hits as the store and the
 * fusion hand them on, and a one-iteration trace around an artifact with the
 * ledger facts a read-out looks at. Pure helpers only — no vitest imports.
 */
import type {
  ConfirmedFinding,
  CriterionEvidence,
  Decision,
  RunTrace,
  SuccessCriterion,
  ValidationReport,
} from '@sysdesign/contracts';

import { samplePack } from '../../pipelines/memory-recall/testing';
import { renderGoal as renderQuery } from '../../pipelines/memory-recall/input';
import { contentHash, type MemoryHit } from './ports';
import {
  buildQuery,
  probeSet,
  type FusedHit,
  type OfferedHit,
  type ProbeSet,
} from './recall/query';

export const FAKE_MODEL = 'fake-embedding';

/** The accept bar both memory pipelines declare; the read-outs take it as a number. */
export const ACCEPT_AT = 75;

export const GOAL = [
  '# Prompt — Serve an order history',
  '',
  '## Scenario',
  '',
  "A storefront lists each customer's past orders, merged from a POS that sends nothing.",
  '',
  '## Functional requirements',
  '',
  '1. List orders newest first.',
  '2. Show each order status.',
].join('\n');

export const hitOf = (
  text: string,
  runId: string,
  ref: string,
  when = '2026-09-06',
): MemoryHit => ({
  text,
  contentHash: contentHash(text),
  source: {
    runId,
    pipeline: 'system-design',
    kind: 'lesson',
    ref,
    decision: 'accept',
    iteration: 1,
    when,
  },
  evidence: [{ kind: 'criterion', ref: 'c1' }],
  digestRunId: null,
  // As a point stored before lineage was recorded reads: a spec about the
  // screen a lineage drives says what it needs on the hit itself.
  lineage: null,
  model: FAKE_MODEL,
  score: 0.9,
});

/** Hits as fusion hands them on: retrieved under the prompt alone unless said otherwise. */
export const fused = (hits: readonly MemoryHit[], probes: number[] = [0]): FusedHit[] =>
  hits.map((hit) => ({ ...hit, probes }));

/** Three candidates a recall over the goal comes back with. */
export const recallHits = (): MemoryHit[] => [
  hitOf('serve the list from a store the page owns', 'run-a', 'memory.1'),
  hitOf('record each status transition as a row', 'run-a', 'memory.2'),
  hitOf('dedupe notifications by event id', 'run-b', 'memory.1'),
];

/** A confirmed finding located at the refs given: what a curator faulted. */
export const faulting = (type: string, locationRefs: string[]): ConfirmedFinding => ({
  key: `${type}|${[...locationRefs].sort().join(',')}`,
  type,
  severity: 'medium',
  confidence: 'high',
  fixability: 'fixable_local',
  locationRefs,
  criterionIds: [],
  hits: 2,
  lenses: ['critic.spec'],
  rationale: null,
  reconciledTo: null,
});

export const passed = (
  criterionId: string,
  kind: string,
  locationRefs: string[],
): CriterionEvidence => ({
  criterionId,
  kind,
  result: 'pass',
  hits: 2,
  confidence: 'high',
  locationRefs,
});

export interface ReadoutInput {
  pipeline: string;
  goal: string;
  artifact: unknown;
  locations: string[];
  criteria?: SuccessCriterion[];
  results?: CriterionEvidence[];
  findings?: ConfirmedFinding[];
  /** What the iteration's validators reported — a warning's problems can name an item. */
  validation?: ValidationReport[];
  decision?: Decision;
  /** Defaults to 90 for an accept, 50 otherwise — override to sit either side of an accept bar. */
  overall?: number;
  /** False is what an open blocker looks like: the gate `admits` deliberately ignores. */
  policyAllowed?: boolean;
  validatorsPassed?: boolean;
}

/** A one-iteration trace around an artifact, for the pure read-outs. */
export function readoutTrace(input: ReadoutInput): RunTrace {
  const decision = input.decision ?? 'accept';
  return {
    pipeline: { id: input.pipeline, version: '1.0.0' },
    contract: { goal: input.goal, criteria: input.criteria ?? [] },
    iterations: [
      {
        iteration: 1,
        mode: 'initial',
        artifact: input.artifact,
        locations: input.locations.map((id) => ({ id, label: id })),
        rendered: '',
        validation: input.validation ?? [],
        critics: [],
        evaluators: [],
        ledger: {
          artifactPresent: true,
          validation: input.validation ?? [],
          criteria: input.results ?? [],
          findings: input.findings ?? [],
          discarded: [],
          diagnostics: [],
        },
        decision: {
          finalDecision: decision,
          gates: {
            artifactPresent: true,
            validatorsPassed: input.validatorsPassed ?? true,
            evidenceSufficient: true,
            policyAllowed: input.policyAllowed ?? true,
          },
          scores: {
            dimensions: {},
            overall: input.overall ?? (decision === 'accept' ? 90 : 50),
          },
          selectedRemediations: [],
          reason: 'spec',
          trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: 0 },
        },
        remediations: [],
        durationMs: 1,
      },
    ],
    bestIteration: 1,
    finalDecision: decision,
    stopReason: decision === 'accept' ? 'accepted' : 'max-iterations',
    lessons: [],
  };
}

/** The query a sample recall composes; a sample that does not compose is a broken fixture. */
export function builtQuery(
  query: string,
  probes: ProbeSet,
  hits: readonly OfferedHit[],
  known: readonly string[] = [],
) {
  const built = buildQuery(query, probes, hits, known);
  if (built.query === null) {
    throw new Error(`the sample query does not compose: ${JSON.stringify(built.issues)}`);
  }
  return built.query;
}

/** A memory-recall run over the sample pack that kept m1 and m2, with m2 faulted. */
export function recallInput(hits: readonly MemoryHit[] = recallHits()): ReadoutInput {
  return {
    pipeline: 'memory-recall',
    goal: renderQuery(builtQuery(GOAL, probeSet(GOAL, []), fused(hits))),
    artifact: samplePack(),
    locations: ['summary', 'm1', 'm2', 'm3', 'gap.1'],
    criteria: [{ id: 'c1', kind: 'need', statement: 'serve a list from an unreliable upstream' }],
    results: [passed('c1', 'need', ['m1'])],
    findings: [faulting('irrelevant_chunk', ['m2'])],
  };
}

export const acceptedRecall = (): RunTrace => readoutTrace(recallInput());

/** An experience-digest run over the digest given, its goal already rendered, judged against one criterion. */
export const digestInput = (digest: unknown, goal: string): ReadoutInput => ({
  pipeline: 'experience-digest',
  goal,
  artifact: digest,
  locations: ['summary', 'memory.1', 'f2', 'r2'],
  criteria: [{ id: 'c1', kind: 'signal', statement: 'accounts for r1 passing at i1' }],
  results: [passed('c1', 'signal', ['memory.1'])],
});
