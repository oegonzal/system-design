import {
  agencyOf,
  attachmentName,
  clip,
  day,
  daysLeftLabel,
  daysUntil,
  minute,
  money,
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
    expect(agencyOf(null)).toBeNull();
  });

  it('clips with an ellipsis and dashes a missing value', () => {
    expect(clip('abcdefgh', 5)).toBe('abcd…');
    expect(clip('abc', 5)).toBe('abc');
    expect(clip(null, 5)).toBe('—');
  });

  it('formats money as whole dollars', () => {
    expect(money(1234567.89)).toBe('$1,234,568');
    expect(money(null)).toBe('—');
  });

  it('counts whole days up to an instant', () => {
    const now = Date.parse('2026-09-20T00:00:00Z');
    expect(daysUntil('2026-09-22T06:00:00Z', now)).toBe(3);
    expect(daysUntil('2026-09-19T00:00:00Z', now)).toBe(-1);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil('not a date', now)).toBeNull();
    expect([null, -2, 0, 5].map(daysLeftLabel)).toEqual(['—', '2 day(s) ago', 'today', '5 day(s)']);
  });

  it('names an attachment by the last path segment, decoded', () => {
    expect(
      attachmentName(
        'https://sam.gov/api/prod/opps/v3/opportunities/resources/files/abc/download?api_key=x',
      ),
    ).toBe('download');
    expect(attachmentName('https://x.gov/files/Drawing%2012345678.pdf')).toBe(
      'Drawing 12345678.pdf',
    );
    expect(attachmentName('https://x.gov/')).toBe('https://x.gov/');
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
