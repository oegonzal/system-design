import {
  agencyDirectoryOf,
  agencyOutlookOf,
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
export const BREAKDOWN = spendingBreakdownOf();
export const HORIZON = spendingHorizonOf();
export const AGENCIES = agencyDirectoryOf();
export const AGENCY_OUTLOOK = agencyOutlookOf();
