import type { MemoryPorts } from '../ports';
import { MemoryRefused } from '../refusal';
import { InMemorySpaceStore, manualClock, sequentialIds, tableEmbedder } from '../testing/fakes';
import { GOLDEN_STRATEGY, present, strategyFixture, TEST_POLICY } from '../testing/fixtures';
import { InMemoryRecordStore } from '../testing/in-memory-record-store';
import { InMemoryVectorIndex } from '../testing/in-memory-vector-index';
import { MemoryService } from './memory-service';

const ports = (): MemoryPorts => ({
  records: new InMemoryRecordStore(),
  spaces: new InMemorySpaceStore(),
  index: new InMemoryVectorIndex('spec__spec-model'),
  embedder: tableEmbedder({ model: 'spec-model', dimensions: 4 }),
  clock: manualClock(new Date('2026-10-01T00:00:00.000Z')),
  ids: sequentialIds(),
  warn: () => undefined,
});

const create = (service: MemoryService, strategy: unknown) =>
  service.createSpace({
    designRunId: 'run-1',
    strategy,
    policy: TEST_POLICY,
    policySource: 'test',
  });

const codeOf = async (call: Promise<unknown>) => {
  try {
    await call;
  } catch (error) {
    if (error instanceof MemoryRefused) return error.code;
    throw error;
  }
  return 'not refused';
};

describe('the memory service', () => {
  it('[AGM-1] keeps a space a strategy compiles into, and reads it back with the same report', async () => {
    const service = new MemoryService(ports());
    const created = await create(service, GOLDEN_STRATEGY);
    if (!('space' in created)) throw new Error('the golden strategy should compile');
    expect(created.space.report.warnings.map(({ code }) => code)).toEqual([
      'metadata.not_a_field',
      'register.no_entry',
      'register.unforgettable',
      'register.unforgettable',
      'register.unforgettable',
      'register.unread',
    ]);
    expect(await service.getSpace(created.space.id)).toEqual(created.space);
  });

  it('[AGM-1] keeps nothing for a strategy that does not read or does not compile', async () => {
    const service = new MemoryService(ports());
    expect(await create(service, { registers: 'not a list' })).toMatchObject({
      report: { problems: [{ code: 'strategy.unreadable' }] },
    });
    const dangling = strategyFixture();
    dangling.interfaces.push({
      ...present(dangling.interfaces[0], 'an interface'),
      register: 'ghost',
    });
    expect(await create(service, dangling)).toMatchObject({
      report: { problems: [{ code: 'interface.unknown_register' }] },
    });
  });

  it('[AGM-3] refuses every verb a register does not declare, and a space it does not keep', async () => {
    const service = new MemoryService(ports());
    const created = await create(service, strategyFixture());
    if (!('space' in created)) throw new Error('the fixture should compile');
    const id = created.space.id;
    const scope = { tenant: 't1' };
    const provenance = { source: 'agent', sourceRunId: null };
    expect(
      await codeOf(
        service.remember(id, {
          register: 'playbooks',
          scope,
          candidate: {},
          provenance,
          metadata: {},
        }),
      ),
    ).toBe('operation.undeclared');
    expect(
      await codeOf(
        service.recall(id, {
          scope,
          registers: ['notes'],
          key: 'k',
          text: null,
          since: null,
          until: null,
          where: {},
        }),
      ),
    ).toBe('operation.undeclared');
    expect(
      await codeOf(service.consolidate('00000000-0000-4000-8000-00000000ffff', { scope })),
    ).toBe('space.not_found');
  });

  it('[AGM-1] answers every verb on a space whose kept strategy no longer reads with space.not_compiled', async () => {
    const memory = ports();
    await memory.spaces.insert({
      id: 'broken',
      designRunId: 'run-1',
      strategy: { registers: 'not a list' },
      policy: TEST_POLICY,
      policySource: 'test',
      createdAt: new Date(),
    });
    const service = new MemoryService(memory);
    expect(await codeOf(service.consolidate('broken', { scope: { tenant: 't1' } }))).toBe(
      'space.not_compiled',
    );
    expect((await service.getSpace('broken')).report.problems.map(({ code }) => code)).toEqual([
      'strategy.unreadable',
    ]);
    expect(await codeOf(service.getSpace('never-kept'))).toBe('space.not_found');
  });
});
