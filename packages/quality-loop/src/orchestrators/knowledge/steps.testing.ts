/**
 * The harness the knowledge step specs share: a step context over in-memory
 * ports, the source pipeline as the registry reports it, a store seeded with
 * what another run already knows, and a support store that keeps rows in a map.
 * It knows what a knowledge step consumes; the fakes it builds on know only the
 * ports. Pure helpers only — no vitest imports.
 */
import type { MemoryContextDto, PipelineSummary, QualityRunDto } from '@sysdesign/contracts';

import { toRunDto, type RunRecord } from '../../core/contracts';
import { SYSTEM_DESIGN } from '../../pipelines/system-design/definition';
import { describePipeline } from '../../core/describe-pipeline';
import {
  fakeEmbeddings,
  InMemoryEmbeddingCache,
  InMemoryMemoryStore,
  vectorOf,
} from '../../modules/memory/testing';
import { CachedEmbeddings } from '../memory/embeddings';
import { contentHash, type StoredChunk } from '../memory/ports';
import { ACCEPT_AT, GOAL } from '../memory/testing';
import { childRun } from '../memory/steps.testing';
import type { StepContext } from '../runner/definition';
import { fakeStepContext } from '../runner/testing';
import type { KnowledgePorts, SupportCount, SupportRow, SupportStore } from './ports';
import { supportKey } from './ports';
import type { KnowledgeOutputs } from './steps';

export { childRun };

/** The source pipeline as `ctx.registry` reports it: the real summary, so the policy map is the real one. */
export const sourceSummary = (): PipelineSummary => describePipeline(SYSTEM_DESIGN as never);

/** A lesson another run stored, as the store holds it and a hit returns it. */
export function storedLesson(
  text: string,
  runId: string,
  ref: string,
  kind: StoredChunk['source']['kind'] = 'lesson',
): StoredChunk {
  const keys = { condition: `when ${text}`, lesson: text };
  return {
    text,
    keys,
    contentHash: contentHash(text),
    source: {
      runId,
      pipeline: 'system-design',
      kind,
      ref,
      decision: 'accept',
      iteration: 1,
      when: '2026-09-08',
    },
    evidence: [{ kind: 'criterion', ref: 'c1' }],
    digestRunId: null,
    // As a point stored before lineage was recorded reads (`hitOf` does the same).
    lineage: null,
    model: 'fake-embedding',
    vectors: { condition: vectorOf(keys.condition), lesson: vectorOf(keys.lesson) },
  };
}

/** What another run already knows: two lessons, one of them about an upstream being down. */
export const KNOWN_TEXT =
  'Give every read path that depends on an upstream a story for it being down';

export class InMemorySupportStore implements SupportStore {
  /** Every row, keyed `${sourceRunId}|${point}|${kind}` — a map so a spec can read it. */
  readonly rows = new Map<string, SupportRow & { sourceRunId: string }>();

  replace(sourceRunId: string, rows: readonly SupportRow[]): Promise<number> {
    for (const [key, row] of this.rows) {
      if (row.sourceRunId === sourceRunId) this.rows.delete(key);
    }
    for (const row of rows) {
      this.rows.set(`${sourceRunId}|${supportKey(row.point)}|${row.kind}`, { ...row, sourceRunId });
    }
    return Promise.resolve(rows.length);
  }

  countByPoint(
    points: readonly { point: SupportRow['point']; contentHash: string }[],
  ): Promise<Map<string, SupportCount>> {
    const wanted = new Map(points.map((item) => [supportKey(item.point), item.contentHash]));
    const counts = new Map<string, SupportCount>();
    for (const row of this.rows.values()) {
      const key = supportKey(row.point);
      // As the adapter does: a claim made against text the item no longer
      // carries is not support for what it says now.
      if (wanted.get(key) !== row.contentHash) continue;
      const count = counts.get(key) ?? { confirms: 0, contradicts: 0 };
      counts.set(key, {
        confirms: count.confirms + (row.kind === 'confirms' ? 1 : 0),
        contradicts: count.contradicts + (row.kind === 'contradicts' ? 1 : 0),
      });
    }
    return Promise.resolve(counts);
  }

  bySourceRun(sourceRunId: string): Promise<SupportRow[]> {
    // As the adapter does: a row is returned as the port's own shape, without
    // the source run it was found by.
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.sourceRunId === sourceRunId)
        .map(({ point, contentHash, kind, digestRunId }) => ({
          point,
          contentHash,
          kind,
          digestRunId,
        })),
    );
  }
}

/** Ports over an in-memory store seeded with what an earlier run already knows. */
export function knowledgePorts(overrides: Partial<KnowledgePorts> = {}): KnowledgePorts {
  const store = new InMemoryMemoryStore();
  void store.replaceRunChunks('run-known', [
    storedLesson(KNOWN_TEXT, 'run-known', 'memory.1'),
    storedLesson('Record each status transition as a row', 'run-known', 'memory.2'),
  ]);
  return {
    embedding: { enabled: true, model: 'fake-embedding', reason: null },
    embeddings: new CachedEmbeddings(fakeEmbeddings(), new InMemoryEmbeddingCache()),
    store,
    support: new InMemorySupportStore(),
    ...overrides,
  };
}

export const knowledgeContext = (overrides: Partial<MemoryContextDto> = {}): MemoryContextDto => ({
  embedding: { enabled: true, model: 'fake-embedding', reason: null },
  store: {
    ready: true,
    reason: null,
    note: null,
    model: 'fake-embedding',
    collection: 'c',
    chunks: 2,
  },
  ...overrides,
});

export type KnowledgeStepContext = StepContext<KnowledgeOutputs, KnowledgePorts> & {
  executed: { goal: string }[];
};

/** A context for one step: `execute` answers with the canned child, recording what it was asked. */
export function stepContext(
  answer: RunRecord | (() => RunRecord) | null,
  overrides: {
    goal?: string;
    context?: Partial<MemoryContextDto>;
    outputs?: Partial<KnowledgeOutputs>;
    ports?: Partial<KnowledgePorts>;
    acceptAt?: number | null;
    registry?: PipelineSummary[];
  } = {},
): KnowledgeStepContext {
  const executed: { goal: string }[] = [];
  const execute = (input: { goal: string }): Promise<QualityRunDto> => {
    executed.push({ goal: input.goal });
    const result = typeof answer === 'function' ? answer() : answer;
    if (!result) throw new Error('no child run was expected');
    return Promise.resolve(toRunDto(result));
  };
  return {
    executed,
    ...fakeStepContext<KnowledgeOutputs, KnowledgePorts>(knowledgePorts(overrides.ports), execute, {
      request: { pipeline: 'system-design', goal: overrides.goal ?? GOAL },
      context: knowledgeContext(overrides.context) as unknown as Record<string, unknown>,
      outputs: overrides.outputs ?? {},
      pipelines: ['system-design'],
      registry: overrides.registry ?? [sourceSummary()],
      acceptAtOf: () => (overrides.acceptAt === undefined ? ACCEPT_AT : overrides.acceptAt),
    }),
  };
}
