/**
 * The harness the step specs share: a memory-run record, a canned child run,
 * a `StepEnv` whose `RunsService` answers by pipeline id, and a ledger that
 * flushes nowhere. Kept beside `testing.ts` rather than inside it because
 * these know what a *step* is, while the fakes there know only the ports.
 */
import type { MemoryRunDto, RunTrace } from '@sysdesign/contracts';

import type { RunRecord } from '../../core/contracts';
import type { RunsService } from '../runs/runs.service';
import { CachedEmbeddings } from './embeddings';
import { noQueryProbes } from './query-probes';
import { StepLedger, type StepEnv } from './steps';
import {
  fakeEmbeddings,
  GOAL,
  hitOf,
  InMemoryEmbeddingCache,
  InMemoryMemoryStore,
  vectorOf,
} from './testing';

/** The accept bar both memory pipelines declare; the steps read it off the summary. */
export const ACCEPT_AT = 75;

/** Only what the steps read off a summary: the id, and the pipeline's own bar. */
export const PIPELINES = ['system-design', 'memory-recall', 'experience-digest'].map((id) => ({
  id,
  policy: { thresholds: { acceptAt: ACCEPT_AT } },
}));

export const pendingStep = () => ({
  status: 'pending' as const,
  reason: null,
  runId: null,
  note: null,
  counts: {},
  startedAt: null,
  finishedAt: null,
});

export const memoryRecord = (overrides: Partial<MemoryRunDto> = {}): MemoryRunDto => ({
  memoryRunId: 'm-1',
  pipeline: 'system-design',
  status: 'running',
  startedAt: '2026-09-07T00:00:00.000Z',
  finishedAt: null,
  request: { goal: GOAL, outputProvided: false, maxIterations: 1 },
  embedding: { enabled: true, model: 'fake-embedding', reason: null },
  store: {
    ready: true,
    reason: null,
    note: null,
    model: 'fake-embedding',
    collection: 'c',
    chunks: 2,
  },
  steps: {
    recall: pendingStep(),
    target: pendingStep(),
    digest: pendingStep(),
    store: pendingStep(),
  },
  error: null,
  ...overrides,
});

/** A child run as `RunsService.execute` resolves it. */
export const childRun = (pipeline: string, trace: RunTrace | null, failed = false): RunRecord => ({
  runId: `${pipeline}-run`,
  pipeline,
  status: failed || trace === null ? 'failed' : 'complete',
  startedAt: '2026-09-07T00:00:00.000Z',
  finishedAt: '2026-09-07T00:01:00.000Z',
  llm: { enabled: true, model: 'test-model', reason: null },
  request: { goal: trace?.contract.goal ?? GOAL, outputProvided: false, maxIterations: 1 },
  trace,
  exchanges: [],
  error: failed ? { name: 'Boom', message: 'the model went away', stack: null } : null,
  git: { branch: 'spec', headSha: 'spec' },
});

export const sampleHits = [
  hitOf('serve the list from a store the page owns', 'run-a', 'memory.1'),
  hitOf('record each status transition as a row', 'run-a', 'memory.2'),
];

/** Every recall run answers with the sample pack; every target with a design; every digest with the sample digest. */
export function stepEnv(
  answers: Record<string, RunRecord | (() => RunRecord)>,
  overrides: Partial<StepEnv> = {},
): StepEnv & { executed: { pipeline: string; goal: string }[] } {
  const executed: { pipeline: string; goal: string }[] = [];
  const runs = {
    list: () => PIPELINES,
    execute: async (
      request: { pipeline: string; goal: string },
      onOpened?: (r: RunRecord) => void,
    ) => {
      executed.push(request);
      const answer = answers[request.pipeline];
      const result = typeof answer === 'function' ? answer() : answer;
      if (!result) throw new Error(`unexpected pipeline ${request.pipeline}`);
      onOpened?.(result);
      return result;
    },
  } as unknown as RunsService;
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
        vectors: {
          condition: vectorOf(keys.condition),
          lesson: vectorOf(keys.lesson),
        },
      };
    }),
  );
  return {
    executed,
    probes: noQueryProbes,
    runs,
    embeddings: new CachedEmbeddings(fakeEmbeddings(), new InMemoryEmbeddingCache()),
    store,
    pipelines: { recall: 'memory-recall', digest: 'experience-digest' },
    ...overrides,
  };
}

export const ledgerOf = (dto = memoryRecord()) =>
  new StepLedger(
    dto,
    () => Promise.resolve(),
    () => 'now',
  );

/** Embeddings whose provider answers nothing — the `embedding-failed` path. */
export const mutedEmbeddings = (): CachedEmbeddings =>
  new CachedEmbeddings(
    { ...fakeEmbeddings(), embed: () => Promise.resolve(null) },
    new InMemoryEmbeddingCache(),
  );
