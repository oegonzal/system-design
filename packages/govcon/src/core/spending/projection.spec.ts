import { periodsOf, type PeriodObligations } from '@sysdesign/contracts';

import { PROJECTION_POLICY, projectFiscalYear } from './projection';

const partial = (fiscalYear: number, period: number, total: number): PeriodObligations => ({
  fiscalYear,
  period,
  contracts: total,
  idvs: 0,
  total,
  partial: true,
});

describe('projecting the fiscal year', () => {
  it('[GOV-21] projects every remaining period as the mean of the prior years with their min and max, scales by the year-to-date ratio only once minimumBasePeriods are complete, and excludes the partial month from the base', () => {
    const series = [
      ...periodsOf(2024, 12, 0.9),
      ...periodsOf(2025, 12, 1.1),
      ...periodsOf(2026, 8, 1.2),
      partial(2026, 9, 1_000_000_000),
    ];
    const projection = projectFiscalYear(
      series,
      { fiscalYear: 2026, period: 9 },
      PROJECTION_POLICY,
    );
    expect(projection).not.toBeNull();
    if (projection === null) throw new Error('expected a projection');
    expect(projection).toMatchObject({
      method: 'seasonal-mean',
      lookbackFiscalYears: [2024, 2025],
      basePeriods: 8,
    });
    expect(projection.ratio).toBeCloseTo(1.2, 3);
    expect(projection.periods.map((period) => period.period)).toEqual([9, 10, 11, 12]);
    const ninth = projection.periods[0];
    const low = Math.round(400_000 * 2.5 * 0.9) + Math.round(60_000 * 0.9);
    const high = Math.round(400_000 * 2.5 * 1.1) + Math.round(60_000 * 1.1);
    expect(ninth).toMatchObject({ fiscalYear: 2026, period: 9, low, high });
    expect(ninth?.expected).toBeCloseTo((low + high) / 2, 6);
    expect(ninth?.scaled).toBeCloseTo(((low + high) / 2) * (projection.ratio ?? 0), 6);
  });

  it('[GOV-21] is null without a complete prior year, leaves scaled null in the first period of a year or on a zero base, and carries negative amounts through', () => {
    expect(
      projectFiscalYear(
        periodsOf(2026, 9, 1.1),
        { fiscalYear: 2026, period: 9 },
        PROJECTION_POLICY,
      ),
    ).toBeNull();
    const zeroYear = periodsOf(2025).map((point) => ({
      ...point,
      contracts: 0,
      idvs: 0,
      total: 0,
    }));
    expect(
      projectFiscalYear(zeroYear, { fiscalYear: 2026, period: 9 }, PROJECTION_POLICY),
    ).toBeNull();

    const firstPeriod = projectFiscalYear(
      [...periodsOf(2026), partial(2027, 1, 5)],
      { fiscalYear: 2027, period: 1 },
      PROJECTION_POLICY,
    );
    expect(firstPeriod).toMatchObject({ basePeriods: 0, ratio: null, lookbackFiscalYears: [2026] });
    expect(firstPeriod?.periods).toHaveLength(12);
    expect(firstPeriod?.periods.every((period) => period.scaled === null)).toBe(true);

    const negative = projectFiscalYear(
      [
        ...periodsOf(2025).map((point) =>
          point.period === 12 ? { ...point, contracts: -100, idvs: 0, total: -100 } : point,
        ),
        ...periodsOf(2026, 11),
        partial(2026, 12, 1),
      ],
      { fiscalYear: 2026, period: 12 },
      PROJECTION_POLICY,
    );
    expect(negative?.periods).toEqual([
      expect.objectContaining({ period: 12, expected: -100, low: -100, high: -100 }),
    ]);
    expect(negative?.periods[0]?.scaled).toBeCloseTo(-100 * (negative?.ratio ?? 0), 6);
  });
});
