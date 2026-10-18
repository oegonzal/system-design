import { strategyFixture, TEST_POLICY } from '@sysdesign/agentic-memory/testing';
import { fakeRun } from '@sysdesign/contracts';

import { HostRefused } from './host-refusal';
import { loopWith, memoryUnderTest, SPEC_POLICY_SOURCE } from './testing';

const refusalOf = async (call: Promise<unknown>): Promise<string> => {
  const error: unknown = await call.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof HostRefused)) {
    throw new Error(`expected a HostRefused, got ${String(error)}`);
  }
  return error.code;
};

describe('a memory space made from a run', () => {
  it('[AGS-8] compiles a settled run’s best strategy into a space that keeps its policy snapshot and where it came from', async () => {
    for (const status of ['complete', 'failed'] as const) {
      const runId = `strategy-${status}`;
      const { service, memory, spaces } = memoryUnderTest(
        loopWith({ [runId]: fakeRun('memory-architecture', strategyFixture(), { runId, status }) }),
      );
      const created = await service.createFromRun(runId);
      if (!('space' in created)) throw new Error(`run ${runId} made no space`);
      expect(created.space).toMatchObject({ designRunId: runId, policySource: SPEC_POLICY_SOURCE });
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
    const { service } = memoryUnderTest(
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
      }),
    );
    expect(await refusalOf(service.createFromRun('missing'))).toBe('run.not_found');
    expect(await refusalOf(service.createFromRun('running'))).toBe('run.in_flight');
    expect(await refusalOf(service.createFromRun('empty'))).toBe('run.no_strategy');
    expect(await refusalOf(service.createFromRun('unreadable'))).toBe('run.no_strategy');
  });
});
