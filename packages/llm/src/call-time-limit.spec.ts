import { describe, expect, it } from 'vitest';

import {
  assertCallTimePolicy,
  CALL_TIME_POLICY,
  callTimeLimitMs,
  CallTimePolicyError,
  describeCallLimit,
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
    // Ten minutes of writing at the floor: a declaration well past the minimum.
    expect(callTimeLimitMs(floorTokensPerSecond * 600)).toBe(overheadMs + 600_000);
    expect(callTimeLimitMs(28_000)).toBeGreaterThan(callTimeLimitMs(10_000));
    expect(describeCallLimit(10_000)).toBe('430 s (10000 declared tokens at 25/s + 30 s)');
  });

  it('[QL-33] runs no call under less than the minimum: a small declaration nothing measured backs gets three minutes', () => {
    const { minimumMs } = CALL_TIME_POLICY;
    expect(minimumMs).toBe(180_000);
    // The probe deriver declares 1,000 tokens and the brief classifier 600:
    // 70 s and 54 s by declaration alone, and neither records its exchanges.
    for (const declared of [0, 600, 1_000, 3_750]) {
      expect(callTimeLimitMs(declared), `${declared} declared`).toBe(minimumMs);
    }
    expect(callTimeLimitMs(3_751)).toBeGreaterThan(minimumMs);
    expect(describeCallLimit(1_000)).toBe(
      '180 s (the minimum; 1000 declared tokens at 25/s + 30 s is 70 s)',
    );
    // Every measured call kept its limit when the minimum came in: none is shorter for it.
    for (const call of calls) {
      expect(callTimeLimitMs(call.maxTokens)).toBeGreaterThanOrEqual(
        callTimeLimitMs(call.maxTokens, { ...CALL_TIME_POLICY, minimumMs: 0 }),
      );
    }
  });

  it('[QL-33] refuses a policy that could never admit a call', () => {
    expect(() => assertCallTimePolicy({ ...CALL_TIME_POLICY, floorTokensPerSecond: 0 })).toThrow(
      CallTimePolicyError,
    );
    expect(() => assertCallTimePolicy({ ...CALL_TIME_POLICY, graceMs: -1 })).toThrow(
      CallTimePolicyError,
    );
    expect(() => assertCallTimePolicy({ ...CALL_TIME_POLICY, minimumMs: -1 })).toThrow(
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
