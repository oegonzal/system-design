import type { RecordScope } from '@sysdesign/contracts';

import { LESSON_PREDICATE } from '../kinds/behaviors';
import type { MemoryPorts, SpaceStore } from '../ports';
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
    name: null,
    designRunId: 'run-1',
    strategy,
    policy: TEST_POLICY,
    policySource: 'test',
  });

/** The fixture ensured under a name, from a run whose strategy is read only when the name is free. */
const ensure = (service: MemoryService, name: string, designRunId: string, strategy?: unknown) =>
  service.ensureSpace({
    name,
    designRunId,
    strategy: () => Promise.resolve(strategy ?? strategyFixture()),
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
    // Made without a name, under the policy's scope keys.
    expect(created.space).toMatchObject({ name: null, scopeKeys: TEST_POLICY.scopeKeys });
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
      name: null,
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

  it('[AGM-11] briefs a writer on every register it may remember into, with what each holds, reconciles on and keeps reserved', async () => {
    const service = new MemoryService(ports());
    const created = await create(service, GOLDEN_STRATEGY);
    if (!('space' in created)) throw new Error('the golden strategy should compile');
    const holds = (name: string) =>
      present(
        GOLDEN_STRATEGY.registers.find((register) => register.name === name),
        name,
      ).holds;
    expect(await service.writeBrief(created.space.id, { tenant: 't1' })).toEqual({
      registers: [
        {
          name: 'episodic_record',
          kind: 'episodic',
          term: 'long_term',
          holds: holds('episodic_record'),
          identity: [],
          reserved: [],
        },
        {
          name: 'semantic_fact',
          kind: 'semantic',
          term: 'long_term',
          holds: holds('semantic_fact'),
          identity: ['subject', 'predicate'],
          reserved: [{ field: 'predicate', value: LESSON_PREDICATE }],
        },
        {
          name: 'working_state',
          kind: 'working',
          term: 'short_term',
          holds: holds('working_state'),
          identity: ['key'],
          reserved: [],
        },
      ],
    });
  });

  it('[AGM-11] leaves the register consolidation promotes playbooks into out of a brief, and reserves the lesson identity on the lesson register alone', async () => {
    const strategy = strategyFixture();
    const rememberNotes = present(strategy.interfaces[0], 'remember on notes');
    strategy.registers.push({ ...present(strategy.registers[1], 'the facts'), name: 'more_facts' });
    // Its invalidates make room for two more remembers within the interfaces' list bound.
    strategy.interfaces = [
      ...strategy.interfaces.filter(({ operation }) => operation !== 'invalidate'),
      { ...rememberNotes, register: 'playbooks' },
      { ...rememberNotes, register: 'more_facts' },
    ];
    const service = new MemoryService(ports());
    const created = await create(service, strategy);
    if (!('space' in created)) throw new Error('the strategy should compile');
    const brief = await service.writeBrief(created.space.id, { tenant: 't1', user: 'u1' });
    expect(brief.registers.map(({ name, reserved }) => ({ name, reserved }))).toEqual([
      { name: 'episodes', reserved: [] },
      { name: 'facts', reserved: [{ field: 'predicate', value: LESSON_PREDICATE }] },
      { name: 'more_facts', reserved: [] },
      { name: 'notes', reserved: [] },
      { name: 'relations', reserved: [] },
    ]);
  });

  it('[AGM-11] refuses a brief wherever a remember is refused for its space or its scope', async () => {
    const memory = ports();
    await memory.spaces.insert({
      id: 'broken',
      name: null,
      designRunId: 'run-1',
      strategy: { registers: 'not a list' },
      policy: TEST_POLICY,
      policySource: 'test',
      createdAt: new Date(),
    });
    const service = new MemoryService(memory);
    const created = await create(service, strategyFixture());
    if (!('space' in created)) throw new Error('the fixture should compile');
    const remembered = (spaceId: string, scope: RecordScope) =>
      service.remember(spaceId, {
        register: 'notes',
        scope,
        candidate: { key: 'k', value: 'v' },
        provenance: { source: 'agent', sourceRunId: null },
        metadata: {},
      });
    const refused: [string, RecordScope][] = [
      ['00000000-0000-4000-8000-00000000ffff', { tenant: 't1' }],
      ['broken', { tenant: 't1' }],
      [created.space.id, { user: 'u1' }],
      [created.space.id, { tenant: 't1', team: 'a' }],
    ];
    const briefs = await Promise.all(
      refused.map(([spaceId, scope]) => codeOf(service.writeBrief(spaceId, scope))),
    );
    expect(briefs).toEqual([
      'space.not_found',
      'space.not_compiled',
      'scope.invalid',
      'scope.invalid',
    ]);
    expect(briefs).toEqual(
      await Promise.all(refused.map(([spaceId, scope]) => codeOf(remembered(spaceId, scope)))),
    );
  });

  it('[AGS-12] ensures a space under a name: made once from a run, the same space for that run again, another run’s claim refused', async () => {
    const service = new MemoryService(ports());
    const made = await ensure(service, 'alpha', 'run-1');
    if (!('space' in made)) throw new Error('the fixture should compile');
    expect(made).toMatchObject({
      created: true,
      space: { name: 'alpha', designRunId: 'run-1', scopeKeys: TEST_POLICY.scopeKeys },
    });
    expect(await ensure(service, 'alpha', 'run-1')).toEqual({ space: made.space, created: false });
    // The space that exists is answered without its strategy: the source is never read.
    expect(
      await service.ensureSpace({
        name: 'alpha',
        designRunId: 'run-1',
        policy: TEST_POLICY,
        policySource: 'test',
        strategy: () => Promise.reject(new Error('the strategy was read')),
      }),
    ).toEqual({ space: made.space, created: false });
    expect(await codeOf(ensure(service, 'alpha', 'run-2'))).toBe('space.name_taken');
    expect(await service.getSpaceByName('alpha')).toEqual(made.space);
    expect(await service.getSpace(made.space.id)).toEqual(made.space);
    expect(await codeOf(service.getSpaceByName('beta'))).toBe('space.not_found');
    // A plain create under a taken name is refused too; one made without a name holds none.
    expect(
      await codeOf(
        service.createSpace({
          name: 'alpha',
          designRunId: 'run-3',
          strategy: strategyFixture(),
          policy: TEST_POLICY,
          policySource: 'test',
        }),
      ),
    ).toBe('space.name_taken');
    const unnamed = await create(service, strategyFixture());
    if (!('space' in unnamed)) throw new Error('the fixture should compile');
    expect(unnamed.space.name).toBeNull();
  });

  it('[AGS-12] keeps nothing under a name for a strategy that does not compile, and refuses a claim that lost its race', async () => {
    const service = new MemoryService(ports());
    const dangling = strategyFixture();
    dangling.interfaces.push({
      ...present(dangling.interfaces[0], 'an interface'),
      register: 'ghost',
    });
    expect(await ensure(service, 'alpha', 'run-1', dangling)).toMatchObject({
      report: { problems: [{ code: 'interface.unknown_register' }] },
    });
    expect(await codeOf(service.getSpaceByName('alpha'))).toBe('space.not_found');

    // Another claim lands between the look-up and the insert: the store refuses the name.
    const raced: SpaceStore = {
      insert: () => Promise.resolve('name_taken'),
      get: () => Promise.resolve(null),
      findByName: () => Promise.resolve(null),
    };
    expect(
      await codeOf(ensure(new MemoryService({ ...ports(), spaces: raced }), 'alpha', 'run-1')),
    ).toBe('space.name_taken');
  });
});
