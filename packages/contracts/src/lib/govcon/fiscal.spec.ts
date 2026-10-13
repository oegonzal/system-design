import {
  currentFiscalPeriod,
  fiscalPeriodOf,
  fiscalYearEnd,
  fiscalYearStart,
  isoDateOf,
  monthLabel,
  periodMonthLabel,
} from './fiscal';

describe('the fiscal calendar', () => {
  it('[GOV-21] maps calendar dates to fiscal years and periods (October is period 1), names the period nowMs falls in, and spells a fiscal year’s first and last day', () => {
    expect(fiscalPeriodOf('2026-10-01')).toEqual({ fiscalYear: 2027, period: 1 });
    expect(fiscalPeriodOf('2026-09-30')).toEqual({ fiscalYear: 2026, period: 12 });
    expect(fiscalPeriodOf('2026-01-15')).toEqual({ fiscalYear: 2026, period: 4 });
    expect(fiscalPeriodOf('2026-12-31')).toEqual({ fiscalYear: 2027, period: 3 });
    expect(isoDateOf(Date.UTC(2026, 9, 12, 23, 59))).toBe('2026-10-12');
    expect(currentFiscalPeriod(Date.UTC(2026, 9, 12))).toEqual({ fiscalYear: 2027, period: 1 });
    expect(currentFiscalPeriod(Date.UTC(2026, 5, 15))).toEqual({ fiscalYear: 2026, period: 9 });
    expect(fiscalYearStart(2027)).toBe('2026-10-01');
    expect(fiscalYearEnd(2027)).toBe('2027-09-30');
    expect([1, 4, 12].map(periodMonthLabel)).toEqual(['Oct', 'Jan', 'Sep']);
    expect(monthLabel(2)).toBe('Feb');
    expect(periodMonthLabel(13)).toBe('13');
  });
});
