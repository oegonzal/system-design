import { periodMonthLabel } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { AGENCY_OUTLOOK, PULSE, PULSE_DELAYED } from '../../testing/spending-fixtures';
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
    // The month in progress is no month to compare: the change rests on the eight that are over.
    expect(figures.comparison?.throughPeriod).toBe(8);
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

  it('[GOVU-13] draws a period the source has not wholly published as provisional, compares the two years over the periods both have settled, and rests the projected year on the settled periods alone', () => {
    const { data } = periodColumns(pulseYears(PULSE_DELAYED));
    expect(data[4]?.values['fy2026']).toBeTypeOf('number');
    for (const index of [5, 6, 7, 8]) {
      expect(data[index]?.values['fy2026']).toMatchObject({ provisional: true });
    }
    expect(data[9]?.values['fy2026']).toMatchObject({ projected: true });

    const settled = (fiscalYear: number) =>
      PULSE_DELAYED.series
        .filter((point) => point.fiscalYear === fiscalYear && point.period <= 5)
        .reduce((total, point) => total + point.total, 0);
    const figures = pulseFigures(PULSE_DELAYED);
    expect(figures.comparison).toEqual({
      throughPeriod: 5,
      now: settled(2026),
      then: settled(2025),
    });
    const projected = (PULSE_DELAYED.projection?.periods ?? []).reduce(
      (total, period) => total + (period.scaled ?? period.expected),
      0,
    );
    expect(figures.projectedTotal?.amount).toBe(settled(2026) + projected);

    // A prior year still filling in is no whole to quote, and a year with nothing settled compares nothing.
    const priorShort = PULSE_DELAYED.series.map((point) =>
      point.fiscalYear === 2025 && point.period === 12 ? { ...point, unpublished: true } : point,
    );
    expect(pulseFigures({ ...PULSE_DELAYED, series: priorShort }).priorTotal).toBeNull();
    const nothingSettled = PULSE.series.map((point) =>
      point.fiscalYear === 2026 ? { ...point, unpublished: true } : point,
    );
    expect(pulseFigures({ ...PULSE, series: nothingSettled }).comparison).toBeNull();
  });
});
