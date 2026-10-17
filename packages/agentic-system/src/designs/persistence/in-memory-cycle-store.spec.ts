import { InMemoryCycleStore } from './in-memory-cycle-store';
import type { MemoryDesignCycle } from '../cycle';

const cycle = (over: Partial<MemoryDesignCycle> = {}): MemoryDesignCycle => ({
  id: 'c1',
  sessionId: 's1',
  status: 'running',
  designRunId: null,
  orchestrationRunId: null,
  note: null,
  startedAt: new Date('2026-10-16T00:00:00Z'),
  updatedAt: new Date('2026-10-16T00:00:00Z'),
  ...over,
});

describe('the in-memory cycle store', () => {
  it('[AGS-2] inserts, finds and merges a patch, keeping stored rows unmutated', async () => {
    const store = new InMemoryCycleStore();
    await store.insert(cycle());
    const found = await store.find('c1');
    expect(found?.status).toBe('running');
    // A caller mutating what it read must not change the store.
    if (found) found.status = 'failed';
    expect((await store.find('c1'))?.status).toBe('running');

    const merged = await store.update('c1', { status: 'coached', designRunId: 'run-1' });
    expect(merged).toMatchObject({ status: 'coached', designRunId: 'run-1', sessionId: 's1' });
    expect(await store.update('missing', { status: 'stored' })).toBeNull();
  });

  it('[AGS-2] lists a session’s cycles only', async () => {
    const store = new InMemoryCycleStore();
    await store.insert(cycle({ id: 'c1', sessionId: 's1' }));
    await store.insert(cycle({ id: 'c2', sessionId: 's2' }));
    await store.insert(cycle({ id: 'c3', sessionId: 's1' }));
    expect((await store.listBySession('s1')).map((row) => row.id).sort()).toEqual(['c1', 'c3']);
  });
});
