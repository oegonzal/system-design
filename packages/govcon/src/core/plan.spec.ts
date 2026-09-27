import { MAX_WINDOW_DAYS, planPulls, validateWindow, windowEndingAt } from './plan';
import { tinyProfile } from './testing';

describe('the pull plan', () => {
  it('is one first page per slice, in declared order, over the validated window', () => {
    const plan = planPulls(tinyProfile(), { from: '2026-09-20', to: '2026-09-26' });
    expect(plan).toEqual([
      { limit: 100, naics: '332710', offset: 0, postedFrom: '2026-09-20', postedTo: '2026-09-26' },
      { limit: 100, naics: '5415', offset: 0, postedFrom: '2026-09-20', postedTo: '2026-09-26' },
    ]);
  });

  it('derives a window of the last n days in UTC, ending today', () => {
    expect(windowEndingAt(new Date('2026-09-26T23:30:00Z'), 3)).toEqual({
      from: '2026-09-23',
      to: '2026-09-26',
    });
    expect(() => windowEndingAt(new Date(), 0)).toThrow(/positive integer/);
  });

  it.each([
    [{ from: '09/20/2026', to: '2026-09-26' }, /YYYY-MM-DD/],
    [{ from: '2026-09-27', to: '2026-09-26' }, /starts after it ends/],
    [{ from: '2025-01-01', to: '2026-09-26' }, new RegExp(`more than ${MAX_WINDOW_DAYS} days`)],
    [{ from: '2026-13-01', to: '2026-09-26' }, /real dates/],
  ])('refuses the window %j', (window, pattern) => {
    expect(() => validateWindow(window)).toThrow(pattern);
  });
});
