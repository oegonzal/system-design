/**
 * The harness the memory step specs share: a step context over in-memory
 * ports, a canned child run for `execute`, and the two ways embeddings can be
 * absent. It knows what a memory step consumes; the fakes it builds on know
 * only the ports.
 */
import type { MemoryContextDto, QualityRunDto, RunTrace } from '@sysdesign/contracts';

import { toRunDto, type RunRecord } from '../../core/contracts';
import {
  fakeEmbeddings,
  InMemoryEmbeddingCache,
  InMemoryMemoryStore,
  vectorOf,
} from '../../modules/memory/testing';
import type { StepContext } from '../runner/definition';
import { fakeStepContext } from '../runner/testing';
import { CachedEmbeddings } from './embeddings';
import type { MemoryPorts, QueryProbes } from './ports';
import type { MemoryOutputs } from './steps';
import { ACCEPT_AT, GOAL, hitOf } from './testing';

export const sampleHits = [
  hitOf('serve the list from a store the page owns', 'run-a', 'memory.1'),
  hitOf('record each status transition as a row', 'run-a', 'memory.2'),
];

/** A child run as `RunsService.execute` resolves it. */
export const childRun = (pipeline: string, trace: RunTrace | null, failed = false): RunRecord => ({
  runId: `${pipeline}-run`,
  pipeline,
  status: failed || trace === null ? 'failed' : 'complete',
  startedAt: '2026-09-07T00:00:00.000Z',
  finishedAt: '2026-09-07T00:01:00.000Z',
  llm: { model: 'test-model' },
  request: {
    goal: trace?.contract.goal ?? GOAL,
    outputProvided: false,
    criteriaProvided: false,

    adoptedFrom: null,
    maxIterations: 1,
  },
  trace,
  exchanges: [],
  error: failed ? { name: 'Boom', message: 'the model went away', stack: null } : null,
  git: { branch: 'spec', headSha: 'spec' },
});

export const memoryContext = (overrides: Partial<MemoryContextDto> = {}): MemoryContextDto => ({
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

/** Ports over an in-memory store seeded with the sample hits. */
/** Derives nothing; recall falls back to the goal — the default probes a spec runs over. */
export const noQueryProbes: QueryProbes = { derive: () => Promise.resolve([]) };

export function memoryPorts(overrides: Partial<MemoryPorts> = {}): MemoryPorts {
  const store = new InMemoryMemoryStore();
  void store.replaceRunChunks(
    'run-a',
    sampleHits.map((hit) => {
      const keys = { condition: `when ${hit.text}`, lesson: hit.text };
      return {
        text: hit.text,
        keys,
        contentHash: hit.contentHash,
        source: hit.source,
        evidence: hit.evidence,
        digestRunId: hit.digestRunId,
        model: hit.model,
        vectors: { condition: vectorOf(keys.condition), lesson: vectorOf(keys.lesson) },
      };
    }),
  );
  return {
    embedding: { enabled: true, model: 'fake-embedding', reason: null },
    embeddings: new CachedEmbeddings(fakeEmbeddings(), new InMemoryEmbeddingCache()),
    store,
    probes: noQueryProbes,
    ...overrides,
  };
}

export type MemoryStepContext = StepContext<MemoryOutputs, MemoryPorts> & {
  executed: { goal: string }[];
};

/** A context for one step: `execute` answers with the canned child, recording what it was asked. */
export function stepContext(
  answer: RunRecord | (() => RunRecord) | null,
  overrides: {
    goal?: string;
    context?: Partial<MemoryContextDto>;
    outputs?: Partial<MemoryOutputs>;
    ports?: Partial<MemoryPorts>;
    acceptAt?: number | null;
  } = {},
): MemoryStepContext {
  const executed: { goal: string }[] = [];
  const execute = (input: { goal: string }): Promise<QualityRunDto> => {
    executed.push({ goal: input.goal });
    const result = typeof answer === 'function' ? answer() : answer;
    if (!result) throw new Error('no child run was expected');
    return Promise.resolve(toRunDto(result));
  };
  return {
    executed,
    ...fakeStepContext<MemoryOutputs, MemoryPorts>(memoryPorts(overrides.ports), execute, {
      request: { pipeline: 'system-design', goal: overrides.goal ?? GOAL },
      context: memoryContext(overrides.context) as unknown as Record<string, unknown>,
      outputs: overrides.outputs ?? {},
      pipelines: ['system-design'],
      acceptAtOf: () => (overrides.acceptAt === undefined ? ACCEPT_AT : overrides.acceptAt),
    }),
  };
}
