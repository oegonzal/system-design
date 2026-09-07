/**
 * Builders the memory specs share. Pure helpers only — no vitest imports.
 * The canned answers are one object per pipeline per stage: `fakeLlm` answers
 * by schema, and every pipeline's criteria, artifact and evaluation schemas
 * differ in their enums, so nothing here cross-matches.
 */
import { createHash } from 'node:crypto';

import type {
  ConfirmedFinding,
  CriterionEvidence,
  Decision,
  MemoryStoreAvailabilityDto,
  RunTrace,
  SuccessCriterion,
} from '@sysdesign/contracts';
import type { EmbeddingClient } from '@sysdesign/llm';

import type { EmbeddingCache, MemoryHit, MemoryStore, StoredChunk } from './ports';
import { collectionName, pointId } from './qdrant/collection';

export const FAKE_MODEL = 'fake-embedding';

/** Deterministic vectors from the text's hash: equal texts embed equally, others differ. */
export function fakeEmbeddings(
  dimensions = 8,
): EmbeddingClient & { calls: string[][]; model: string } {
  const calls: string[][] = [];
  return {
    enabled: true,
    model: FAKE_MODEL,
    dimensions,
    calls,
    embed: (inputs) => {
      calls.push([...inputs]);
      return Promise.resolve(inputs.map((text) => vectorOf(text, dimensions)));
    },
  };
}

export function vectorOf(text: string, dimensions = 8): number[] {
  const digest = createHash('sha256').update(text, 'utf8').digest();
  const raw = Array.from(
    { length: dimensions },
    (_, index) => digest[index % digest.length] / 255 - 0.5,
  );
  const norm = Math.hypot(...raw) || 1;
  return raw.map((value) => value / norm);
}

const cosine = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0) /
  ((Math.hypot(...a) || 1) * (Math.hypot(...b) || 1));

export class InMemoryMemoryStore implements MemoryStore {
  readonly points = new Map<string, StoredChunk>();
  unreachable = false;

  constructor(
    private readonly model: string | null = FAKE_MODEL,
    private readonly dimensions = 8,
  ) {}

  verify(): Promise<MemoryStoreAvailabilityDto> {
    const collection = this.model === null ? null : collectionName(this.model, this.dimensions);
    if (this.model === null) {
      return Promise.resolve({
        ready: false,
        reason: 'no-model',
        note: null,
        model: null,
        collection,
        chunks: 0,
      });
    }
    if (this.unreachable) {
      return Promise.resolve({
        ready: false,
        reason: 'unreachable',
        note: 'store unreachable',
        model: this.model,
        collection,
        chunks: 0,
      });
    }
    return Promise.resolve({
      ready: true,
      reason: null,
      note: null,
      model: this.model,
      collection,
      chunks: this.points.size,
    });
  }

  search(vector: readonly number[], limit: number): Promise<MemoryHit[]> {
    if (this.unreachable) return Promise.reject(new Error('store unreachable'));
    const seen = new Set<string>();
    const hits = [...this.points.values()]
      .map((chunk) => ({ chunk, score: cosine(vector, chunk.vector) }))
      .sort((a, b) => b.score - a.score)
      .filter(({ chunk }) => !seen.has(chunk.contentHash) && seen.add(chunk.contentHash))
      .slice(0, limit)
      .map(({ chunk, score }) => ({
        text: chunk.text,
        contentHash: chunk.contentHash,
        source: chunk.source,
        evidence: chunk.evidence,
        digestRunId: chunk.digestRunId,
        model: chunk.model,
        score,
      }));
    return Promise.resolve(hits);
  }

  replaceRunChunks(sourceRunId: string, chunks: readonly StoredChunk[]): Promise<number> {
    if (this.unreachable) return Promise.reject(new Error('store unreachable'));
    for (const [id, chunk] of this.points) {
      if (chunk.source.runId === sourceRunId) this.points.delete(id);
    }
    for (const chunk of chunks) this.points.set(pointId(sourceRunId, chunk.source.ref), chunk);
    return Promise.resolve(chunks.length);
  }
}

export class InMemoryEmbeddingCache implements EmbeddingCache {
  readonly entries = new Map<string, number[]>();

  find(model: string, hashes: readonly string[]): Promise<Map<string, number[]>> {
    const found = new Map<string, number[]>();
    for (const hash of hashes) {
      const vector = this.entries.get(`${model}|${hash}`);
      if (vector) found.set(hash, vector);
    }
    return Promise.resolve(found);
  }

  save(model: string, entries: readonly { hash: string; vector: number[] }[]): Promise<void> {
    for (const entry of entries) this.entries.set(`${model}|${entry.hash}`, entry.vector);
    return Promise.resolve();
  }
}

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

const result = (criterionId: string, locationRefs: string[]) => ({
  criterionId,
  result: 'pass',
  confidence: 'high',
  locationRefs,
  rationale: 'shown by a named mechanism',
});

/** One canned reply per pipeline per stage, in the order `fakeLlm` tries them. */
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
        insight: 'serve the list from a store the page owns',
        caveat: null,
      },
      {
        chunk: 'm2',
        serves: 'order status',
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

/** A one-iteration trace around an artifact, for the pure read-outs. */
export function traceOf(input: {
  pipeline: string;
  goal: string;
  artifact: unknown;
  locations: string[];
  criteria?: SuccessCriterion[];
  results?: CriterionEvidence[];
  findings?: ConfirmedFinding[];
  decision?: Decision;
}): RunTrace {
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
        validation: [],
        critics: [],
        evaluators: [],
        ledger: {
          artifactPresent: true,
          validation: [],
          criteria: input.results ?? [],
          findings: input.findings ?? [],
          discarded: [],
          diagnostics: [],
        },
        decision: {
          finalDecision: decision,
          gates: {
            artifactPresent: true,
            validatorsPassed: true,
            evidenceSufficient: true,
            policyAllowed: true,
          },
          scores: { dimensions: {}, overall: decision === 'accept' ? 90 : 50 },
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

export const confirmed = (type: string, locationRefs: string[]): ConfirmedFinding => ({
  key: `${type}|${[...locationRefs].sort().join(',')}`,
  type,
  severity: 'medium',
  confidence: 'high',
  fixability: 'fixable_local',
  locationRefs,
  criterionIds: [],
  hits: 2,
  lenses: ['critic.spec'],
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

export const hitOf = (
  text: string,
  runId: string,
  ref: string,
  when = '2026-09-06',
): MemoryHit => ({
  text,
  contentHash: createHash('sha256').update(text, 'utf8').digest('hex'),
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
  model: FAKE_MODEL,
  score: 0.9,
});
