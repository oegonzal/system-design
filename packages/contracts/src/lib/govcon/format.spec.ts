import {
  agencyOf,
  clip,
  compactMoney,
  day,
  daysLeftLabel,
  daysUntil,
  isDueSoonAt,
  minute,
  money,
  rangeLabel,
  summarizePull,
} from './format';
import { pullReportOf, sliceReportOf } from './fixtures';

describe('govcon formatting', () => {
  it('renders dates as their ISO date and minute, never through a zone', () => {
    expect(day('2026-10-10T23:30:00.000Z')).toBe('2026-10-10');
    expect(day(null)).toBe('—');
    expect(minute('2026-10-10T23:30:00.000Z')).toBe('2026-10-10 23:30');
  });

  it('names the office at the end of a dotted agency path', () => {
    expect(agencyOf('DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY.DLA AVIATION')).toBe('DLA AVIATION');
    expect(agencyOf('DLA')).toBe('DLA');
    expect(agencyOf('DEPT OF JUSTICE. MARSHALS SERVICE ')).toBe('MARSHALS SERVICE');
    expect(agencyOf(null)).toBeNull();
  });

  it('clips with an ellipsis and dashes a missing value', () => {
    expect(clip('abcdefgh', 5)).toBe('abcd…');
    expect(clip('abc', 5)).toBe('abc');
    expect(clip(null, 5)).toBe('—');
  });

  it('formats money as whole dollars, and compactly for a tick or a tile', () => {
    expect(money(1234567.89)).toBe('$1,234,568');
    expect(money(null)).toBe('—');
    expect(compactMoney(1234567)).toBe('$1.2M');
    expect(compactMoney(850000)).toBe('$850K');
    expect(compactMoney(-3400000)).toBe('-$3.4M');
    expect(compactMoney(null)).toBe('—');
  });

  it('counts whole days up to an instant', () => {
    const now = Date.parse('2026-09-20T00:00:00Z');
    expect(daysUntil('2026-09-22T06:00:00Z', now)).toBe(3);
    expect(daysUntil('2026-09-19T00:00:00Z', now)).toBe(-1);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil('not a date', now)).toBeNull();
    expect(rangeLabel(0, 10, 24)).toBe('1–10 of 24');
    expect(rangeLabel(20, 4, 24)).toBe('21–24 of 24');
    expect(rangeLabel(0, 0, 0)).toBe('0 of 0');
    expect([null, -2, 0, 5].map(daysLeftLabel)).toEqual(['—', '2 day(s) ago', 'today', '5 day(s)']);
  });

  it('calls a mark due soon inside the week, the last day and a passed one included', () => {
    const now = Date.parse('2026-09-26T12:00:00Z');
    expect(isDueSoonAt(['2026-10-03T12:00:00.000Z'], now)).toBe(true);
    expect(isDueSoonAt(['2026-10-03T12:00:00.001Z'], now)).toBe(false);
    expect(isDueSoonAt(['2026-09-01T00:00:00.000Z'], now)).toBe(true);
    expect(isDueSoonAt(['2026-10-10T12:00:00.000Z', '2026-09-28T09:00:00.000Z'], now)).toBe(true);
    expect(isDueSoonAt([null, 'not a date'], now)).toBe(false);
    expect(isDueSoonAt([], now)).toBe(false);
  });

  it('summarizes a pull the way the CLI and the client both print it', () => {
    const report = pullReportOf({
      slices: [
        sliceReportOf(),
        sliceReportOf({ outcome: 'cached', pages: 0, inserted: 0, received: 0 }),
        sliceReportOf({ outcome: 'budget-exhausted', pages: 0, inserted: 0, received: 0 }),
        sliceReportOf({ outcome: 'skipped', pages: 0, inserted: 0, received: 0 }),
      ],
      spent: 3,
      budget: 3,
      stoppedBy: 'budget',
    });
    expect(summarizePull(report)).toBe(
      '3 of 3 attempts used in the last 24 h · 2 stored · 1 cached · 2 not pulled (stopped: budget)',
    );
    expect(summarizePull(pullReportOf({ spent: null }))).toMatch(/^\? of 1000 attempts/);
  });
});
