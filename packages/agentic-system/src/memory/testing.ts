import { randomUUID } from 'node:crypto';

import { MemoryService } from '@sysdesign/agentic-memory';
import {
  InMemoryRecordStore,
  InMemorySpaceStore,
  InMemoryVectorIndex,
  tableEmbedder,
  TEST_POLICY,
} from '@sysdesign/agentic-memory/testing';
import type { QualityRunDto } from '@sysdesign/contracts';
import type { LoopClient } from '@sysdesign/loop-client';

import { SpacesService } from './spaces.service';

/** Where the specs' spaces say their policy came from. */
export const SPEC_POLICY_SOURCE = 'memory/spec';

/** A loop that has exactly the runs a spec names. */
export const loopWith = (
  runs: Readonly<Record<string, QualityRunDto>>,
): Pick<LoopClient, 'getRun'> => ({
  getRun: (runId) => Promise.resolve(runs[runId] ?? null),
});

/**
 * The memory layer as the module composes it, over the runtime's in-memory
 * ports instead of Postgres and Qdrant, under the runtime's own test policy:
 * the memory service, the space store it keeps spaces in, and the spaces
 * service reading runs from the loop a spec hands in.
 */
export function memoryUnderTest(loop: Pick<LoopClient, 'getRun'>) {
  const spaces = new InMemorySpaceStore();
  const embedder = tableEmbedder({ model: 'spec-embedder', dimensions: 4 });
  const memory = new MemoryService({
    records: new InMemoryRecordStore(),
    spaces,
    index: new InMemoryVectorIndex(`spec__${embedder.model}`),
    embedder,
    clock: () => new Date('2026-10-16T00:00:00.000Z'),
    ids: randomUUID,
    warn: () => undefined,
  });
  return {
    memory,
    spaces,
    service: new SpacesService(loop, memory, TEST_POLICY, SPEC_POLICY_SOURCE),
  };
}
