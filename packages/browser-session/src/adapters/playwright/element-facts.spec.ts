import { describe, expect, it } from 'vitest';

import { readWithinBudget } from './element-facts';

/** A clock the test advances itself, so the budget is decided and not raced. */
const clockOf = (stepMs: number) => {
  let now = 1_000;
  return {
    now: (): number => now,
    tick: (): void => {
      now += stepMs;
    },
  };
};

describe('reading element facts within a budget', () => {
  it('[BRW-2] stops reading when the budget is spent and counts what it never read, so one observation cannot outlast the rails that bound the session', async () => {
    // Six elements, each read costing 300ms against a 1s budget: four reads
    // fit (at 0, 300, 600, 900) and the fifth finds the deadline passed.
    const clock = clockOf(300);
    const seen: string[] = [];
    const { facts, unread } = await readWithinBudget(
      ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'],
      (ref) => {
        seen.push(ref);
        clock.tick();
        return Promise.resolve({ ref });
      },
      clock.now,
      1_000,
    );
    expect(seen).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect([...facts.keys()]).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(unread).toBe(2);
  });

  it('[BRW-2] counts an element whose facts did not arrive rather than listing it, because the adapter cannot say it is enabled, visible or untrapped', async () => {
    const clock = clockOf(0);
    const { facts, unread } = await readWithinBudget(
      ['e1', 'e2', 'e3'],
      (ref) => Promise.resolve(ref === 'e2' ? null : { ref }),
      clock.now,
      10_000,
    );
    expect([...facts.keys()]).toEqual(['e1', 'e3']);
    expect(unread).toBe(1);

    // A budget already spent reads nothing at all, and says so.
    const spent = await readWithinBudget(['e1', 'e2'], () => Promise.resolve({}), clock.now, 0);
    expect(spent.facts.size).toBe(0);
    expect(spent.unread).toBe(2);

    // No elements is not an unread element.
    const empty = await readWithinBudget([], () => Promise.resolve({}), clock.now, 10_000);
    expect(empty.unread).toBe(0);
  });
});
