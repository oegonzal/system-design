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
  storedChunkOf,
} from '../../modules/memory/testing';
import type { StepContext } from '../runner/definition';
import { fakeStepContext } from '../runner/testing';
import { CachedEmbeddings } from './embeddings';
import type { MemoryHit, MemoryPorts, QueryProbes } from './ports';
import type { MemoryOutputs } from './steps';
import { ACCEPT_AT, GOAL, hitOf } from './testing';

export const sampleHits = [
  hitOf('serve the list from a store the page owns', 'run-a', 'memory.1'),
  hitOf('record each status transition as a row', 'run-a', 'memory.2'),
];

/** The same two items as a document taught them about its subject: what a form's recall may read. */
export const sampleFacts = sampleHits.map((hit) => ({
  ...hit,
  source: { ...hit.source, kind: 'profile_fact' as const },
}));

/** A child run as `RunsService.execute` resolves it. */
export const childRun = (pipeline: string, trace: RunTrace | null, failed = false): RunRecord => ({
  runId: `${pipeline}-run`,
  pipeline,
  status: failed || trace === null ? 'failed' : 'complete',
  startedAt: '2026-09-07T00:00:00.000Z',
  finishedAt: '2026-09-07T00:01:00.000Z',
  heartbeatAt: '2026-09-07T00:01:00.000Z',
  llm: { model: 'test-model' },
  request: {
    goal: trace?.contract.goal ?? GOAL,
    outputProvided: false,
    criteriaProvided: false,

    adoptedFrom: null,
    maxIterations: 1,
  },
  parentRunId: null,
  openedBy: null,
  recall: null,
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

/** Derives nothing; recall falls back to the goal — the default probes a spec runs over. */
export const noQueryProbes: QueryProbes = { derive: () => Promise.resolve([]) };

/**
 * The memory ports over a store seeded with `seeded` — design lessons unless a
 * spec says otherwise — each hit stored with everything it carries, its scope
 * and unit among them, so a search reads it as the store would.
 */
export function memoryPorts(
  overrides: Partial<MemoryPorts> = {},
  seeded: readonly MemoryHit[] = sampleHits,
): MemoryPorts {
  const store = new InMemoryMemoryStore();
  void store.replaceRunChunks(
    'run-a',
    seeded.map((hit) => storedChunkOf(hit)),
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
