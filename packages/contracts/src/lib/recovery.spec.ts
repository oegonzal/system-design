import { describe, expect, it } from 'vitest';

import { NO_RECOVERY, recoverySchema, rideOut, type RecoveryClock } from './recovery';

/** A clock that advances only when slept, and remembers each pause. */
const ticking = (): RecoveryClock & { slept: number[] } => {
  let now = 0;
  const slept: number[] = [];
  return {
    now: () => now,
    sleep: async (ms) => {
      slept.push(ms);
      now += ms;
    },
    slept,
  };
};

const TEN_SECONDS = { windowMs: 10_000, pauseMs: 2_000 };

describe('riding out a restarting service', () => {
  it('asks again at the pause while the settled outcome is transient, and returns the first that is not', async () => {
    const clock = ticking();
    let calls = 0;
    const value = await rideOut(
      TEN_SECONDS,
      async () => (++calls <= 2 ? 'starting' : 'ready'),
      (outcome) => 'value' in outcome && outcome.value === 'starting',
      clock,
    );
    expect([value, calls, clock.slept]).toEqual(['ready', 3, [2_000, 2_000]]);
  });

  it('throws the last error once the window closes — a pause at 0, 2, 4, 6 and 8 s of a 10 s window — and at once one that is not transient', async () => {
    const clock = ticking();
    let calls = 0;
    await expect(
      rideOut(
        TEN_SECONDS,
        async () => {
          calls += 1;
          throw new Error(`down ${calls}`);
        },
        (outcome) => 'error' in outcome,
        clock,
      ),
    ).rejects.toThrow('down 5');
    expect(clock.slept).toHaveLength(4);

    let once = 0;
    await expect(
      rideOut(
        TEN_SECONDS,
        async () => {
          once += 1;
          throw new TypeError('refused');
        },
        (outcome) => 'error' in outcome && !(outcome.error instanceof TypeError),
        clock,
      ),
    ).rejects.toThrow('refused');
    expect(once).toBe(1);
  });

  it('with no recovery asks once whatever the outcome; the declared shape is the two numbers and nothing beside them', async () => {
    let calls = 0;
    await expect(
      rideOut(
        NO_RECOVERY,
        async () => {
          calls += 1;
          throw new Error('down');
        },
        () => true,
        ticking(),
      ),
    ).rejects.toThrow('down');
    expect(calls).toBe(1);
    expect(recoverySchema.safeParse(NO_RECOVERY).success).toBe(true);
    expect(recoverySchema.safeParse({ windowMs: 1_000, pauseMs: 0 }).success).toBe(false);
    expect(recoverySchema.safeParse({ windowMs: 1_000, pauseMs: 100, now: Date.now }).success).toBe(
      false,
    );
  });
});
