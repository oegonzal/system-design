import { alignSeries } from './series';
import { seriesPointOf } from './testing';

describe('aligning a series', () => {
  it('[GOV-21] aligns a series on the fiscal periods of the window: absent periods are zero, duplicates sum, spill past the window is dropped, the current period is marked partial and nothing after it is emitted', () => {
    const points = [
      seriesPointOf({ fiscalYear: 2025, period: 1, contracts: 10, idvs: 1, total: 11 }),
      seriesPointOf({ fiscalYear: 2025, period: 1, contracts: 5, idvs: 0, total: 5 }),
      seriesPointOf({ fiscalYear: 2026, period: 3, contracts: 7, idvs: 2, total: 9 }),
      seriesPointOf({ fiscalYear: 2026, period: 4, contracts: 99, idvs: 0, total: 99 }),
      seriesPointOf({ fiscalYear: 2027, period: 1 }),
      seriesPointOf({ fiscalYear: 2024, period: 12 }),
      seriesPointOf({ fiscalYear: 2026, period: null }),
      seriesPointOf({ fiscalYear: 2026, period: 13 }),
    ];
    const aligned = alignSeries(
      points,
      { fromFiscalYear: 2025, toFiscalYear: 2026 },
      { fiscalYear: 2026, period: 3 },
      null,
    );
    expect(aligned).toHaveLength(15);
    expect(aligned[0]).toEqual({
      fiscalYear: 2025,
      period: 1,
      contracts: 15,
      idvs: 1,
      total: 16,
      partial: false,
      unpublished: false,
    });
    expect(aligned[1]).toMatchObject({ fiscalYear: 2025, period: 2, total: 0 });
    expect(aligned.at(-1)).toEqual({
      fiscalYear: 2026,
      period: 3,
      contracts: 7,
      idvs: 2,
      total: 9,
      partial: true,
      unpublished: false,
    });
    expect(aligned.filter((point) => point.partial)).toHaveLength(1);
    expect(aligned.some((point) => point.total === 99)).toBe(false);
  });

  it('[GOV-21] emits nothing for a year not begun and carries a negative amount through', () => {
    const aligned = alignSeries(
      [seriesPointOf({ fiscalYear: 2026, period: 1, contracts: -5, idvs: 0, total: -5 })],
      { fromFiscalYear: 2026, toFiscalYear: 2027 },
      { fiscalYear: 2026, period: 2 },
      null,
    );
    expect(aligned.map((point) => [point.fiscalYear, point.period, point.total])).toEqual([
      [2026, 1, -5],
      [2026, 2, 0],
    ]);
  });

  it('[GOV-25] marks unpublished every period that ends after the last day wholly published, in a past year and the current one alike, and none when nothing is delayed', () => {
    const window = { fromFiscalYear: 2026, toFiscalYear: 2027 };
    const current = { fiscalYear: 2027, period: 1 };
    const unpublished = (completeThrough: string | null) =>
      alignSeries([], window, current, completeThrough)
        .filter((point) => point.unpublished)
        .map((point) => `${point.fiscalYear}:${point.period}`);
    // Read on 2026-10-12 with a 90-day lag: July ends after July 14, June does not.
    expect(unpublished('2026-07-14')).toEqual(['2026:10', '2026:11', '2026:12', '2027:1']);
    // A period is published on the very day it ends.
    expect(unpublished('2026-07-31')).toEqual(['2026:11', '2026:12', '2027:1']);
    expect(unpublished(null)).toEqual([]);
  });
});
