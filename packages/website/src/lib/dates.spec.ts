import { describe, expect, it } from 'vitest';

import { type Day, formatDay, formatMonths, formatYears, type Period, yearOf } from './dates';

describe('dates', () => {
  it('reads a period month by month, first and last month included, once when they are one', () => {
    expect(formatMonths({ start: '2024-06', end: '2026-01' })).toBe('Jun 2024 – Jan 2026');
    expect(formatMonths({ start: '2026-01', end: '2026-01' })).toBe('Jan 2026');
  });

  it('reads a period by year, once when it starts and ends in the same year', () => {
    expect(formatYears({ start: '2020-12', end: '2024-06' })).toBe('2020–2024');
    expect(formatYears({ start: '2026-01', end: '2026-07' })).toBe('2026');
  });

  it('reads a day in words, and its year', () => {
    expect(formatDay('2025-10-24')).toBe('October 24, 2025');
    expect(formatDay('2027-01-01')).toBe('January 1, 2027');
    expect(yearOf('2025-12-31')).toBe(2025);
  });

  it('refuses a month or day the calendar does not have, and a period that ends before it starts', () => {
    expect(() => formatYears({ start: '2026-13', end: '2026-12' })).toThrow(/YYYY-MM/);
    expect(() => formatYears({ start: '2026-1' as Period['start'], end: '2026-12' })).toThrow(
      /YYYY-MM/,
    );
    expect(() => formatDay('0099-01-01')).toThrow(/YYYY-MM-DD/);
    expect(() => formatMonths({ start: '2026-07', end: '2026-01' })).toThrow(/before it starts/);
    expect(() => formatDay('2025-02-30')).toThrow(/YYYY-MM-DD/);
    expect(() => yearOf('2025-10-4' as Day)).toThrow(/YYYY-MM-DD/);
  });
});
