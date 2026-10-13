import { periodMonthLabel } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { AGENCY_OUTLOOK, PULSE } from '../../testing/spending-fixtures';
import { agencyYears, periodColumns, pulseYears } from './period-columns';
import { pulseFigures } from './pulse-figures';
import { EMPTY_SCOPE, scopeQueryOf, toggleCode } from './scope';

describe('the spending page’s data', () => {
  it('[GOVU-11] turns the scope bar’s draft into the query, toggling codes in and out of a typed list', () => {
    expect(toggleCode('', '332710')).toBe('332710');
    expect(toggleCode('332710', '541511')).toBe('332710, 541511');
    expect(toggleCode('332710, 541511', '332710')).toBe('541511');
    expect(scopeQueryOf(EMPTY_SCOPE)).toEqual({ awardFamily: 'both' });
    expect(
      scopeQueryOf({ naics: '332710, 541511', psc: '5340', agency: '097', awardFamily: 'idvs' }),
    ).toEqual({ naics: ['332710', '541511'], psc: ['5340'], agency: '097', awardFamily: 'idvs' });
  });

  it('[GOVU-11] lays fiscal years over twelve periods newest first, marking the period in progress provisional and the rest projected with its band', () => {
    const { series, data } = periodColumns(pulseYears(PULSE));
    expect(series.map((item) => item.label)).toEqual(['FY2026', 'FY2025', 'FY2024', 'FY2023']);
    expect(data.map((datum) => datum.label)).toEqual(
      Array.from({ length: 12 }, (_, index) => periodMonthLabel(index + 1)),
    );
    expect(data[8]?.values['fy2026']).toMatchObject({ provisional: true });
    expect(data[9]?.values['fy2026']).toMatchObject({ projected: true, band: expect.any(Object) });
    expect(data[11]?.values['fy2025']).toBeTypeOf('number');
    expect(periodColumns(pulseYears(PULSE), 2).series).toHaveLength(2);

    const agency = periodColumns(agencyYears(AGENCY_OUTLOOK.years));
    expect(agency.series[0]?.label).toBe('FY2026');
    expect(agency.data[0]?.values['fy2026']).toBeUndefined();
    expect(agency.data[1]?.values['fy2026']).toBe(70_000_000_000);
  });

  it('[GOVU-11] sums the year to date, the prior year to the same period, and what the projection adds', () => {
    const figures = pulseFigures(PULSE);
    expect(figures).toMatchObject({ fiscalYear: 2026, throughPeriod: 9 });
    const toDate = PULSE.series
      .filter((p) => p.fiscalYear === 2026)
      .reduce((s, p) => s + p.total, 0);
    const priorToDate = PULSE.series
      .filter((p) => p.fiscalYear === 2025 && p.period <= 9)
      .reduce((s, p) => s + p.total, 0);
    expect(figures.toDate).toBe(toDate);
    expect(figures.priorToDate).toBe(priorToDate);
    expect(figures.priorTotal).toBeGreaterThan(priorToDate);
    expect(figures.projectedTotal?.amount).toBeGreaterThan(toDate);
    expect(figures.remainder?.amount).toBeCloseTo(
      (figures.projectedTotal?.amount ?? 0) - toDate,
      6,
    );
    expect(figures.remainder?.low).toBeLessThan(figures.remainder?.high ?? 0);
    expect(pulseFigures({ ...PULSE, projection: null })).toMatchObject({
      remainder: null,
      projectedTotal: null,
    });
  });
});
