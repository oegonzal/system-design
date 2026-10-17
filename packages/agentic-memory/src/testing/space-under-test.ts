/**
 * A compiled space over in-memory ports, for the engine's own specs: a strategy
 * and a policy (the fixtures unless a spec names others), a clock moved by
 * hand, and the warnings the runtime reported.
 */
import type { MemoryStrategy } from '@sysdesign/contracts';

import { DEFAULT_BEHAVIORS } from '../kinds/behaviors';
import type { Embedder, MemoryPorts } from '../ports';
import { compileSpace } from '../space/compile';
import type { MemoryPolicy } from '../space/policy';
import type { SpaceContext } from '../write/write';
import { InMemorySpaceStore, manualClock, sequentialIds, tableEmbedder } from './fakes';
import { strategyFixture, TEST_POLICY } from './fixtures';
import { InMemoryRecordStore } from './in-memory-record-store';
import { InMemoryVectorIndex } from './in-memory-vector-index';

export const SPACE_UNDER_TEST = 'space-under-test';

export function spaceUnderTest(
  options: { strategy?: MemoryStrategy; policy?: MemoryPolicy; embedder?: Embedder } = {},
) {
  const records = new InMemoryRecordStore();
  const embedder = options.embedder ?? tableEmbedder({ model: 'spec-model', dimensions: 4 });
  const index = new InMemoryVectorIndex(embedder.model === null ? null : `spec__${embedder.model}`);
  const clock = manualClock(new Date('2026-10-01T00:00:00.000Z'));
  const warnings: string[] = [];
  const ports: MemoryPorts = {
    records,
    spaces: new InMemorySpaceStore(),
    index,
    embedder,
    clock,
    ids: sequentialIds(),
    warn: (message) => warnings.push(message),
  };
  const { compiled, report } = compileSpace(
    options.strategy ?? strategyFixture(),
    options.policy ?? TEST_POLICY,
    DEFAULT_BEHAVIORS,
  );
  if (compiled === null) {
    throw new Error(
      `the strategy under test does not compile: ${report.problems.map(({ code }) => code).join(', ')}`,
    );
  }
  const ctx: SpaceContext = { ports, spaceId: SPACE_UNDER_TEST, space: compiled };
  return { ctx, records, index, clock, warnings };
}
