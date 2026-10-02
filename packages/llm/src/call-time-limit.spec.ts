import { describe, expect, it } from 'vitest';

import {
  assertCallTimePolicy,
  CALL_TIME_POLICY,
  callTimeLimitMs,
  CallTimePolicyError,
  watchDeadline,
} from './call-time-limit';
import measured from './fixtures/measured-calls.json';

/**
 * Successful calls extracted from the recorded runs (static/runs/<run>/05-llm/
 * <call>.meta.json, 2026-09-20 → 2026-10-02): the longest, the slowest per
 * token, the tightest against their own declaration, the ones that wrote past
 * it, and the longest of every pipeline stage. Each keeps what it declared,
 * what it wrote and how long it took.
 */
interface MeasuredCall {
  run: string;
  call: string;
  maxTokens: number;
  outputTokens: number;
  durationMs: number;
}

const calls = measured as MeasuredCall[];

describe('a call’s time limit', () => {
  it('[QL-33] every measured successful call finishes inside the limit its own declaration derives', () => {
    expect(calls.length).toBeGreaterThan(40);
    const cut = calls.filter((call) => call.durationMs > callTimeLimitMs(call.maxTokens));
    expect(cut.map((call) => `${call.run}/${call.call}`)).toEqual([]);
  });

  it('[QL-33] the answers the fixed 300 s cap would have cut are inside their derived limits', () => {
    // The cap this replaces sat at 300 s for every call; the calls nearest it
    // were long answers, and a long declaration now buys the time to write one.
    const nearCap = calls.filter((call) => call.durationMs > 250_000);
    expect(nearCap.length).toBeGreaterThan(5);
    for (const call of nearCap) {
      expect(callTimeLimitMs(call.maxTokens), call.call).toBeGreaterThan(300_000);
    }
  });

  it('[QL-33] is the whole declared answer at the floor, plus the overhead — and grows with the declaration', () => {
    const { overheadMs, floorTokensPerSecond } = CALL_TIME_POLICY;
    expect(callTimeLimitMs(0)).toBe(overheadMs);
    expect(callTimeLimitMs(floorTokensPerSecond * 10)).toBe(overheadMs + 10_000);
    expect(callTimeLimitMs(28_000)).toBeGreaterThan(callTimeLimitMs(1_000));
  });

  it('[QL-33] refuses a policy that could never admit a call', () => {
    expect(() => assertCallTimePolicy({ ...CALL_TIME_POLICY, floorTokensPerSecond: 0 })).toThrow(
      CallTimePolicyError,
    );
    expect(() => assertCallTimePolicy({ ...CALL_TIME_POLICY, graceMs: -1 })).toThrow(
      CallTimePolicyError,
    );
    expect(assertCallTimePolicy(CALL_TIME_POLICY)).toBe(CALL_TIME_POLICY);
  });
});

describe('watchDeadline', () => {
  const settle = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

  it('[QL-33] fires once at the limit and lets go a grace later', async () => {
    let fired = 0;
    const deadline = watchDeadline({
      limitMs: 20,
      graceMs: 20,
      onLimit: () => (fired += 1),
      tickMs: 2,
    });
    expect(deadline.expired).toBe(false);
    await deadline.abandoned;
    expect(fired).toBe(1);
    expect(deadline.expired).toBe(true);
  });

  it('[QL-33] reads the wall clock, so a limit that passed while the process was not ticking is acted on at the next tick', async () => {
    // A clock that jumps an hour, as one does across a sleep: the next tick
    // sees the limit and the grace both passed.
    let wall = 0;
    let fired = 0;
    const deadline = watchDeadline({
      limitMs: 300_000,
      graceMs: 15_000,
      onLimit: () => (fired += 1),
      now: () => wall,
      tickMs: 2,
    });
    await settle(10);
    expect(fired).toBe(0);
    wall = 3_600_000;
    await deadline.abandoned;
    expect(fired).toBe(1);
  });

  it('[QL-33] stops watching when told, and never fires after', async () => {
    let fired = 0;
    const deadline = watchDeadline({
      limitMs: 10,
      graceMs: 0,
      onLimit: () => (fired += 1),
      tickMs: 2,
    });
    deadline.stop();
    await settle(30);
    expect(fired).toBe(0);
    expect(deadline.expired).toBe(false);
  });
});
