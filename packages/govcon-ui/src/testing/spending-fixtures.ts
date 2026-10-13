import {
  agencyDirectoryOf,
  agencyOutlookOf,
  fiscalPeriodEnd,
  projectedPeriodOf,
  publicationDelayOf,
  spendingBreakdownOf,
  spendingHorizonOf,
  spendingPulseOf,
} from '@sysdesign/contracts';

/**
 * The spending story the specs and stories share: machine shops, every
 * agency, both families, read on 2026-06-15 — period 9 of FY2026 — with
 * three complete years behind it. The builders in contracts carry the
 * numbers; this file only fixes the instant the client reads them at.
 */
export const SPENDING_NOW_MS = Date.UTC(2026, 5, 15, 12);
export const PULSE = spendingPulseOf();
export const DELAY = publicationDelayOf();
/** The same pulse with one agency 90 days late: FY2026's periods 6 to 9 end after the last whole day, so they are marked and projected with the rest. */
export const PULSE_DELAYED = spendingPulseOf({
  series: PULSE.series.map((point) => ({
    ...point,
    unpublished: fiscalPeriodEnd(point) > DELAY.completeThrough,
  })),
  projection: {
    method: 'seasonal-mean',
    lookbackFiscalYears: [2023, 2024, 2025],
    basePeriods: 5,
    ratio: 1.1,
    periods: [6, 7, 8, 9, 10, 11, 12].map((period) => projectedPeriodOf(2026, period)),
  },
  delay: DELAY,
});
export const BREAKDOWN = spendingBreakdownOf();
export const HORIZON = spendingHorizonOf();
export const AGENCIES = agencyDirectoryOf();
export const AGENCY_OUTLOOK = agencyOutlookOf();
