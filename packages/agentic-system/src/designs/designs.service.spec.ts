import { DesignsService } from './designs.service';
import { MemoryDesignDriver } from './driver';
import { InMemoryCycleStore } from './persistence/in-memory-cycle-store';
import { FakeEventSink, FakeLoopClient } from './testing';
import type { DesignSettings } from './settings';

const clock = (): Date => new Date('2026-10-16T00:00:00Z');
const settings: DesignSettings = {
  pipeline: 'memory-architecture',
  orchestrator: 'memory-design',
  maxIterations: 3,
  recall: true,
  pollEveryMs: 1,
};
const goal = '# Design an agentic-memory service';

describe('the design cycle', () => {
  it('[AGS-3] coaches a memory strategy, learns from the run, and ends stored', async () => {
    const loop = new FakeLoopClient();
    const store = new InMemoryCycleStore();
    const events = new FakeEventSink();
    const service = new DesignsService(
      store,
      new MemoryDesignDriver(loop, settings),
      events,
      clock,
    );

    const started = await service.start(goal);
    expect(started.status).toBe('running');
    await service.execute(started.id, goal);

    const cycle = await service.get(started.id);
    expect(cycle).toMatchObject({
      status: 'stored',
      designRunId: 'coach-run-1',
      orchestrationRunId: 'learn-run-1',
    });
    // The coach run carried the brief and coach-only recall, and supplied no output —
    // the pipeline generates the strategy from the brief.
    expect(loop.runs[0]).toMatchObject({
      pipeline: 'memory-architecture',
      recall: true,
      maxIterations: 3,
    });
    expect(loop.runs[0].output).toBeUndefined();
    // The finished run was handed to the orchestrator to digest and store.
    expect(loop.fromRun).toEqual([{ runId: 'coach-run-1' }]);
    // Each transition was announced on the bus: started, coached, stored.
    expect(events.emitted.map((c) => c.status)).toEqual(['running', 'coached', 'stored']);
  });

  it('[AGS-3] records a failure on the row and ends nothing else', async () => {
    const loop = new FakeLoopClient();
    loop.startRun = () => Promise.reject(new Error('loop down'));
    const service = new DesignsService(
      new InMemoryCycleStore(),
      new MemoryDesignDriver(loop, { ...settings, maxIterations: 1 }),
      new FakeEventSink(),
      clock,
    );
    const started = await service.start(goal);
    await service.execute(started.id, goal);
    expect(await service.get(started.id)).toMatchObject({ status: 'failed', note: 'loop down' });
  });
});
