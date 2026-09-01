import { describe, expect, it } from 'vitest';

import { flashSaleFacts } from './testing';
import {
  affordableSyncHops,
  availabilityNines,
  availabilityTargetPct,
  latencyBudgetMs,
  PER_HOP_LATENCY_MS,
  strictestTarget,
} from './targets';

const withLatency = (value: number) => {
  const base = flashSaleFacts();
  return flashSaleFacts({
    nfrs: base.nfrs.map((nfr) =>
      nfr.targetSpec?.metric === 'p99_latency_ms'
        ? { ...nfr, targetSpec: { ...nfr.targetSpec, value } }
        : nfr,
    ),
  });
};

describe('strictestTarget', () => {
  it('is null when the prompt states no machine-readable target for the metric', () => {
    expect(strictestTarget(flashSaleFacts({ nfrs: [] }), 'p99_latency_ms')).toBeNull();
  });

  it('takes the smallest for a <= metric and the largest for a >=', () => {
    const facts = flashSaleFacts({
      nfrs: [
        {
          id: 'a',
          kind: 'latency',
          statement: 'a',
          target: null,
          targetSpec: { metric: 'p99_latency_ms', op: '<=', value: 400, unit: 'ms' },
        },
        {
          id: 'b',
          kind: 'latency',
          statement: 'b',
          target: null,
          targetSpec: { metric: 'p99_latency_ms', op: '<=', value: 120, unit: 'ms' },
        },
        {
          id: 'c',
          kind: 'availability',
          statement: 'c',
          target: null,
          targetSpec: { metric: 'availability_pct', op: '>=', value: 99.9, unit: '%' },
        },
        {
          id: 'd',
          kind: 'availability',
          statement: 'd',
          target: null,
          targetSpec: { metric: 'availability_pct', op: '>=', value: 99.99, unit: '%' },
        },
      ],
    });
    // Two latency demands: you are held to the tighter one.
    expect(strictestTarget(facts, 'p99_latency_ms')?.id).toBe('b');
    // Two availability demands: you are held to the higher one.
    expect(strictestTarget(facts, 'availability_pct')?.id).toBe('d');
  });
});

describe('latencyBudgetMs', () => {
  it('is the strictest number the prompt states, wherever it states it', () => {
    const base = flashSaleFacts();
    expect(latencyBudgetMs(base)).toBe(250);

    // A tight requirement beside a loose headline is still a tight design.
    const tightRequirement = flashSaleFacts({
      ...withLatency(80),
      scaleTargets: { ...base.scaleTargets, p99LatencyMs: 900 },
    });
    expect(latencyBudgetMs(tightRequirement)).toBe(80);

    // …and the reverse: a loose requirement does not soften a tight headline.
    const looseRequirement = flashSaleFacts({
      ...withLatency(900),
      scaleTargets: { ...base.scaleTargets, p99LatencyMs: 80 },
    });
    expect(latencyBudgetMs(looseRequirement)).toBe(80);
  });

  it('falls back to the headline when no requirement carries a spec', () => {
    const facts = flashSaleFacts({ nfrs: [] });
    expect(latencyBudgetMs(facts)).toBe(facts.scaleTargets.p99LatencyMs);
  });
});

describe('affordableSyncHops', () => {
  /**
   * The number the old hard-coded rule encoded: five hops against the
   * reference prompt's 250ms. Wiring the target had to reproduce it, or it
   * would have been a silent retune wearing the clothes of a refactor.
   */
  it('reproduces the judgement the hard-coded threshold used to make', () => {
    expect(affordableSyncHops(flashSaleFacts())).toBe(5);
    expect(PER_HOP_LATENCY_MS * 5).toBe(250);
  });

  it('scales with the budget, which is the whole point', () => {
    expect(affordableSyncHops(withLatency(100))).toBe(2);

    // Loosening only the requirement buys nothing: the 250ms headline still
    // binds. Both have to give before the design gets more headroom.
    expect(affordableSyncHops(withLatency(1000))).toBe(5);
    const base = flashSaleFacts();
    const loose = flashSaleFacts({
      ...withLatency(1000),
      scaleTargets: { ...base.scaleTargets, p99LatencyMs: 1000 },
    });
    expect(affordableSyncHops(loose)).toBe(20);
  });

  it('never drops below one hop — a design still has to reach something', () => {
    expect(affordableSyncHops(withLatency(10))).toBe(1);
  });
});

describe('availability', () => {
  it('reads the target and counts its nines', () => {
    const base = flashSaleFacts();
    expect(availabilityTargetPct(base)).toBeGreaterThan(99);
    expect(
      availabilityNines(
        flashSaleFacts({
          nfrs: [],
          scaleTargets: { ...base.scaleTargets, availabilityPct: '99.9' },
        }),
      ),
    ).toBe(3);
    expect(
      availabilityNines(
        flashSaleFacts({
          nfrs: [],
          scaleTargets: { ...base.scaleTargets, availabilityPct: '99.99' },
        }),
      ),
    ).toBe(4);
  });
});
