import { createWriteQueue, isLive, SESSION_STALE_AFTER_MS } from './write-queue';

describe('the write queue', () => {
  it('[BRW-5] keeps order, never makes the caller wait, reports a failed write and drains to the last one', async () => {
    const reports: string[] = [];
    const queue = createWriteQueue((what, error) => reports.push(`${what}: ${String(error)}`));
    const order: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    queue.write('first', async () => {
      await gate;
      order.push('first');
    });
    queue.write('second', async () => {
      order.push('second');
      throw new Error('disk full');
    });
    queue.write('third', async () => {
      order.push('third');
    });
    // Nothing has run past the gate, and the caller has not waited.
    expect(order).toEqual([]);
    expect(queue.pending).toBe(3);

    release();
    await queue.drain();
    expect(order).toEqual(['first', 'second', 'third']);
    expect(reports).toEqual(['second: Error: disk full']);
    expect(queue.pending).toBe(0);
  });
});

describe("a session's beat", () => {
  it('[BRW-5] tells a live session from a dead one by its beat against the declared window', () => {
    const now = new Date('2026-10-03T10:01:00.000Z');
    expect(isLive('2026-10-03T10:00:30.000Z', now)).toBe(true);
    expect(isLive(new Date(now.getTime() - SESSION_STALE_AFTER_MS).toISOString(), now)).toBe(true);
    expect(isLive(new Date(now.getTime() - SESSION_STALE_AFTER_MS - 1).toISOString(), now)).toBe(
      false,
    );
  });
});
