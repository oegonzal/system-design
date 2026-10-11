import { InProcessWakeup } from './wakeup';

describe('the wakeup', () => {
  it('[NTF-2] wakes a waiter notified between its arming and its wait, and every waiter at once', async () => {
    const wakeup = new InProcessWakeup();
    const early = wakeup.arm();
    wakeup.notify();
    expect(await early.wait(5_000)).toBe('woken');

    const one = wakeup.arm();
    const two = wakeup.arm();
    const waiting = Promise.all([one.wait(5_000), two.wait(5_000)]);
    wakeup.notify();
    expect(await waiting).toEqual(['woken', 'woken']);
  });

  it('[NTF-2] times out, forgets a cancelled waiter, and releases every waiter once closed — and every one armed after', async () => {
    const wakeup = new InProcessWakeup();
    expect(await wakeup.arm().wait(10)).toBe('timeout');

    const cancelled = wakeup.arm();
    cancelled.cancel();
    wakeup.notify();
    expect(await cancelled.wait(10)).toBe('timeout');

    const waiting = wakeup.arm().wait(5_000);
    wakeup.close();
    expect(await waiting).toBe('closed');
    expect(await wakeup.arm().wait(5_000)).toBe('closed');
  });
});
