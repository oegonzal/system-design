import { createWriteQueue } from './write-queue';

describe('the write queue', () => {
  it('[BRW-5] keeps order, never makes the caller wait, reports a failed write and drains to the last one', async () => {
    const reports: string[] = [];
    const queue = createWriteQueue((what, error) => reports.push(`${what}: ${String(error)}`));
    const order: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    void queue.write('first', async () => {
      await gate;
      order.push('first');
    });
    void queue.write('second', async () => {
      order.push('second');
      throw new Error('disk full');
    });
    const third = queue.write('third', async () => {
      order.push('third');
    });
    // Nothing has run past the gate, and the caller has not waited.
    expect(order).toEqual([]);

    release();
    await third;
    expect(order).toEqual(['first', 'second', 'third']);
    await queue.drain();
    expect(reports).toEqual(['second: Error: disk full']);
  });
});
