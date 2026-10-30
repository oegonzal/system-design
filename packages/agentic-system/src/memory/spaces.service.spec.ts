import { MemoryRefused } from '@sysdesign/agentic-memory';
import { strategyFixture, TEST_POLICY } from '@sysdesign/agentic-memory/testing';
import { fakeRun, type QualityRunReadDto } from '@sysdesign/contracts';

import { HostRefused } from './host-refusal';
import { loopWith, memoryUnderTest, SPEC_POLICY_SOURCE } from './testing';

/** The code a call was refused with, by the host or by the runtime. */
const refusalOf = async (call: Promise<unknown>): Promise<string> => {
  const error: unknown = await call.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (error instanceof HostRefused || error instanceof MemoryRefused) return error.code;
  throw new Error(`expected a refusal, got ${String(error)}`);
};

const strategyRun = (runId: string) => fakeRun('memory-architecture', strategyFixture(), { runId });

/** The three runs a space is refused from: one the loop does not have, one still running, one holding no strategy that reads. */
const refusedRuns = () =>
  loopWith({
    running: fakeRun('memory-architecture', strategyFixture(), {
      runId: 'running',
      status: 'running',
    }),
    empty: fakeRun('memory-architecture', null, { runId: 'empty' }),
    unreadable: fakeRun(
      'memory-architecture',
      { registers: 'not a list' },
      { runId: 'unreadable' },
    ),
  });

describe('a memory space made from a run', () => {
  it('[AGS-8] compiles a settled run’s best strategy into a space that keeps its policy snapshot and where it came from', async () => {
    for (const status of ['complete', 'failed'] as const) {
      const runId = `strategy-${status}`;
      const { service, memory, spaces } = memoryUnderTest(
        loopWith({ [runId]: fakeRun('memory-architecture', strategyFixture(), { runId, status }) }),
      );
      const created = await service.createFromRun(runId);
      if (!('space' in created)) throw new Error(`run ${runId} made no space`);
      expect(created.space).toMatchObject({
        name: null,
        designRunId: runId,
        policySource: SPEC_POLICY_SOURCE,
        scopeKeys: TEST_POLICY.scopeKeys,
      });
      expect(created.space.report.problems).toEqual([]);
      expect(created.space.report.consolidation).not.toBeNull();
      // Kept with the policy it was made under, and read back as it was answered.
      expect((await spaces.get(created.space.id))?.policy).toEqual(TEST_POLICY);
      expect(await memory.getSpace(created.space.id)).toEqual(created.space);
    }
  });

  it('[AGS-8] answers the compile report, keeping nothing, for a strategy that does not compile', async () => {
    const broken = strategyFixture();
    broken.interfaces.push({ ...broken.interfaces[0], register: 'nowhere' });
    const { service } = memoryUnderTest(
      loopWith({ broken: fakeRun('memory-architecture', broken, { runId: 'broken' }) }),
    );
    const created = await service.createFromRun('broken');
    if (!('report' in created)) throw new Error('a strategy that does not compile made a space');
    expect(created.report.problems.map(({ code }) => code)).toEqual(['interface.unknown_register']);
  });

  it('[AGS-8] refuses a run the loop does not have, one still running, and one holding no strategy', async () => {
    const { service } = memoryUnderTest(refusedRuns());
    expect(await refusalOf(service.createFromRun('missing'))).toBe('run.not_found');
    expect(await refusalOf(service.createFromRun('running'))).toBe('run.in_flight');
    expect(await refusalOf(service.createFromRun('empty'))).toBe('run.no_strategy');
    expect(await refusalOf(service.createFromRun('unreadable'))).toBe('run.no_strategy');
  });
});

describe('a memory space ensured under a name', () => {
  it('[AGS-12] is made from the run once, is the same space for that run again, and refuses another run’s claim on the name', async () => {
    const { service, memory, spaces } = memoryUnderTest(
      loopWith({ one: strategyRun('one'), two: strategyRun('two') }),
    );
    const made = await service.ensureNamed('alpha', 'one');
    if (!('space' in made)) throw new Error('run one made no space');
    expect(made).toMatchObject({
      created: true,
      space: { name: 'alpha', designRunId: 'one', policySource: SPEC_POLICY_SOURCE },
    });
    expect(await service.ensureNamed('alpha', 'one')).toEqual({
      space: made.space,
      created: false,
    });
    expect(await refusalOf(service.ensureNamed('alpha', 'two'))).toBe('space.name_taken');
    expect((await spaces.findByName('alpha'))?.id).toBe(made.space.id);
    expect(await memory.getSpaceByName('alpha')).toEqual(made.space);
    // Another name is another space, from whichever run.
    const other = await service.ensureNamed('beta', 'two');
    if (!('space' in other)) throw new Error('run two made no space');
    expect(other.space.id).not.toBe(made.space.id);
  });

  it('[AGS-12] answers the space that run made without reading the run again: the same name from the same run is the space though the loop has pruned the run or reports it running, another run’s claim is still refused, and a free name still reads its run', async () => {
    const runs: Record<string, QualityRunReadDto> = {
      one: strategyRun('one'),
      two: strategyRun('two'),
    };
    const { service } = memoryUnderTest({
      getRun: (runId) => Promise.resolve(runs[runId] ?? null),
    });
    const made = await service.ensureNamed('alpha', 'one');
    if (!('space' in made)) throw new Error('run one made no space');
    delete runs['one'];
    expect(await service.ensureNamed('alpha', 'one')).toEqual({
      space: made.space,
      created: false,
    });
    runs['one'] = fakeRun('memory-architecture', strategyFixture(), {
      runId: 'one',
      status: 'running',
    });
    expect(await service.ensureNamed('alpha', 'one')).toEqual({
      space: made.space,
      created: false,
    });
    expect(await refusalOf(service.ensureNamed('alpha', 'two'))).toBe('space.name_taken');
    expect(await refusalOf(service.ensureNamed('beta', 'gone'))).toBe('run.not_found');
  });

  it('[AGS-12] is refused for the runs a create is refused for, and keeps nothing for a strategy that does not compile', async () => {
    const broken = strategyFixture();
    broken.interfaces.push({ ...broken.interfaces[0], register: 'nowhere' });
    const loop = refusedRuns();
    const { service, spaces } = memoryUnderTest({
      getRun: (runId) =>
        runId === 'broken'
          ? Promise.resolve(fakeRun('memory-architecture', broken, { runId }))
          : loop.getRun(runId),
    });
    expect(await refusalOf(service.ensureNamed('alpha', 'missing'))).toBe('run.not_found');
    expect(await refusalOf(service.ensureNamed('alpha', 'running'))).toBe('run.in_flight');
    expect(await refusalOf(service.ensureNamed('alpha', 'empty'))).toBe('run.no_strategy');
    expect(await refusalOf(service.ensureNamed('alpha', 'unreadable'))).toBe('run.no_strategy');
    const ensured = await service.ensureNamed('alpha', 'broken');
    if (!('report' in ensured)) throw new Error('a strategy that does not compile made a space');
    expect(ensured.report.problems.map(({ code }) => code)).toEqual(['interface.unknown_register']);
    expect(await spaces.findByName('alpha')).toBeNull();
  });
});
