import type { RunOpenerDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { inStartOrder, narrowedHint, openersOf, openerText, type OpenedRecord } from './openers';

const SESSION = 'e657ef24-0c1d-4b2e-9f3a-1d2c3b4a5f60';
const OTHER = '9a8b7c6d-1111-4222-8333-444455556666';

const opener = (id: string, label: string): RunOpenerDto => ({
  kind: 'browser-session',
  id,
  label,
});

const record = (openedBy: RunOpenerDto | null, startedAt: string): OpenedRecord => ({
  openedBy,
  startedAt,
});

describe('who opened what, as the inspector’s lists say it', () => {
  it('[QLU-14] a row names its opener by kind, the head of its id and what the run was to it', () => {
    expect(openerText(opener(SESSION, 'step 6 · form page'))).toBe(
      'browser-session e657ef24 · step 6 · form page',
    );
    // A caller that gave no label is still named, without a dangling separator.
    expect(openerText(opener(SESSION, ''))).toBe('browser-session e657ef24');
    // Nobody said: nothing is inferred.
    expect(openerText(null)).toBeNull();
  });

  it('[QLU-14] the filter offers each opener once, the latest first, dated by its earliest record', () => {
    const records = [
      record(opener(SESSION, 'step 7'), '2026-10-10T06:40:00.000Z'),
      record(null, '2026-10-10T06:50:00.000Z'),
      record(opener(OTHER, 'step 1'), '2026-10-09T08:00:00.000Z'),
      record(opener(SESSION, 'step 1'), '2026-10-10T06:33:00.000Z'),
    ];
    const options = openersOf(records, null);
    expect(options.map((option) => option.id)).toEqual([SESSION, OTHER]);
    expect(options[0].text).toBe(
      `browser-session e657ef24 · ${new Date('2026-10-10T06:33:00.000Z').toLocaleString()}`,
    );
  });

  it('[QLU-14] the opener the URL names is offered even when no loaded record names it', () => {
    const records = [record(opener(OTHER, 'step 1'), '2026-10-09T08:00:00.000Z')];
    expect(openersOf(records, SESSION)).toEqual([
      expect.objectContaining({ id: OTHER }),
      { id: SESSION, text: SESSION },
    ]);
    // Once its records are read, it is named from them like any other.
    expect(openersOf(records, OTHER)).toHaveLength(1);
    expect(openersOf([], null)).toEqual([]);
  });

  it('[QLU-14] one opener’s records read oldest first, whatever order the loop listed them in', () => {
    const newestFirst = [
      record(opener(SESSION, 'step 3'), '2026-10-10T06:45:00.000Z'),
      record(opener(SESSION, 'step 2'), '2026-10-10T06:40:00.000Z'),
      record(opener(SESSION, 'step 1'), '2026-10-10T06:33:00.000Z'),
    ];
    expect(inStartOrder(newestFirst).map((entry) => entry.openedBy?.label)).toEqual([
      'step 1',
      'step 2',
      'step 3',
    ]);
    // The list it was given is left as it was.
    expect(newestFirst[0].openedBy?.label).toBe('step 3');
  });

  it('[QLU-14] the hint says the order, and how much of a long session one page holds', () => {
    expect(narrowedHint({ shown: 12, total: 12 }, { shown: 8, total: 8 })).toBe(
      'Oldest first — runs: 12, orchestrations: 8.',
    );
    expect(narrowedHint({ shown: 100, total: 140 }, { shown: 0, total: 0 })).toBe(
      'Oldest first — runs: the latest 100 of 140, orchestrations: 0.',
    );
  });
});
