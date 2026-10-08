import { describe, expect, it } from 'vitest';

import { DEFAULT_GATE_POLICY, GatePolicyError, InFlightGate } from './in-flight-gate';

/** A promise a spec settles by hand, so a permit is held exactly as long as the spec wants. */
const held = () => {
  let release!: () => void;
  let fail!: (error: Error) => void;
  const work = new Promise<string>((resolve, reject) => {
    release = () => resolve('done');
    fail = reject;
  });
  return { work, release, fail };
};

const settled = () => new Promise((resolve) => setImmediate(resolve));

describe('InFlightGate', () => {
  it('[QL-27] admits up to the ceiling and holds the rest until a permit frees', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 2 } });
    const jobs = [held(), held(), held()];
    let peak = 0;
    const run = jobs.map((job) =>
      gate.run(async () => {
        peak = Math.max(peak, gate.snapshot().inFlight);
        return job.work;
      }),
    );

    await settled();
    expect(gate.snapshot()).toEqual({ ceiling: 2, inFlight: 2, waiting: 1 });

    jobs[0].release();
    await settled();
    // The third was admitted only once the first let go, so two is the most
    // that ever ran at once.
    expect(peak).toBe(2);
    expect(gate.snapshot().inFlight).toBe(2);

    jobs[1].release();
    jobs[2].release();
    expect(await Promise.all(run)).toEqual(['done', 'done', 'done']);
    expect(gate.snapshot()).toEqual({ ceiling: 2, inFlight: 0, waiting: 0 });
  });

  it('[QL-27] admits in arrival order, so a call queued behind a wave is not starved', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 } });
    const first = held();
    const admitted: string[] = [];
    const running = gate.run(() => first.work);
    await settled();

    const queued = ['b', 'c', 'd'].map((name) =>
      gate.run(async () => {
        admitted.push(name);
        return name;
      }),
    );
    await settled();
    expect(admitted).toEqual([]);

    first.release();
    await Promise.all([running, ...queued]);
    expect(admitted).toEqual(['b', 'c', 'd']);
  });

  it('[QL-27] work that throws still frees its permit, and the failure reaches the caller', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 } });

    await expect(gate.run(() => Promise.reject(new Error('the provider refused')))).rejects.toThrow(
      'the provider refused',
    );
    // A leaked permit here would wedge every later call, so this is the one
    // failure the gate must survive.
    expect(gate.snapshot()).toEqual({ ceiling: 1, inFlight: 0, waiting: 0 });
    await expect(gate.run(() => Promise.resolve('after'))).resolves.toBe('after');
  });

  it('[QL-27] reports the wait, so queueing is never charged to the call', async () => {
    let clock = 1_000;
    const gate = new InFlightGate({ policy: { ceiling: 1 }, now: () => clock });
    const first = held();
    const running = gate.run(() => first.work);
    await settled();

    let waited = -1;
    const queued = gate.run(async ({ queuedMs }) => {
      waited = queuedMs;
      return 'second';
    });
    await settled();

    clock = 4_500;
    first.release();
    await Promise.all([running, queued]);
    expect(waited).toBe(3_500);
  });

  it('[QL-27] a call that never waited reports no wait', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 }, now: () => 42 });

    await expect(gate.run(({ queuedMs }) => Promise.resolve(queuedMs))).resolves.toBe(0);
  });

  it('[QL-27] a ceiling below one is refused where it is declared, not discovered in flight', () => {
    for (const ceiling of [0, -1, 1.5, Number.NaN]) {
      expect(() => new InFlightGate({ policy: { ceiling } })).toThrow(GatePolicyError);
    }
    // The default clears every pipeline's declared concurrency, so one run is
    // never throttled by the process ceiling.
    expect(DEFAULT_GATE_POLICY.ceiling).toBeGreaterThanOrEqual(3);
  });

  it('[QL-27] hands a freed permit to the first waiter, so a caller arriving in the same breath never slips past it at a ceiling of one', async () => {
    // The race, scheduled exactly: the holder settles, and a third caller is
    // queued as a microtask right behind the holder's release — before the
    // waiter has resumed. A release that dropped the count and then woke the
    // waiter let that third caller in, and the waiter took its own permit on
    // top: two in flight at a ceiling of one.
    const gate = new InFlightGate({ policy: { ceiling: 1 } });
    const first = held();
    const second = held();
    const admitted: string[] = [];
    let peak = 0;
    const note = (name: string): void => {
      admitted.push(name);
      peak = Math.max(peak, gate.snapshot().inFlight);
    };
    const runFirst = gate.run(() => first.work);
    await settled();
    const runSecond = gate.run(async () => {
      note('second');
      return second.work;
    });
    await settled();
    expect(gate.snapshot()).toEqual({ ceiling: 1, inFlight: 1, waiting: 1 });

    first.release();
    const runThird = Promise.resolve().then(() =>
      gate.run(async () => {
        note('third');
        return 'third';
      }),
    );
    await settled();
    // The waiter holds the permit; the newcomer waits its turn.
    expect(admitted).toEqual(['second']);
    expect(gate.snapshot()).toEqual({ ceiling: 1, inFlight: 1, waiting: 1 });

    second.release();
    expect(await Promise.all([runFirst, runSecond, runThird])).toEqual(['done', 'done', 'third']);
    expect(admitted).toEqual(['second', 'third']);
    expect(peak).toBe(1);
    expect(gate.snapshot()).toEqual({ ceiling: 1, inFlight: 0, waiting: 0 });
  });
});
