import { currentFiscalPeriod, fiscalYearEnd, fiscalYearStart, isoDateOf } from './fiscal';

/**
 * The windows a lens is read over, as presets. Declared here so the
 * client's controls and the service's warm compute the same two dates from
 * the same instant, and so key the same snapshot. Two whole fiscal years
 * are offered, not one: for a quarter after a fiscal year ends, an agency
 * that publishes late has not finished it, and the year before is the
 * latest that reads whole. Both together read the year that just closed and
 * the one under way as one window.
 */
export const WINDOW_PRESETS = [
  { id: 'fytd', label: 'Fiscal year to date' },
  { id: 'prior-fy', label: 'Prior fiscal year' },
  { id: 'this-and-prior-fy', label: 'This and prior fiscal year' },
  { id: 'fy-before-last', label: 'Fiscal year before last' },
  { id: 'last-12-months', label: 'Last 12 months' },
] as const;
export type WindowPreset = (typeof WINDOW_PRESETS)[number]['id'];

export interface DateWindow {
  from: string;
  to: string;
}

/** A preset as two ISO dates at `nowMs`, through the fiscal calendar. */
export function windowOf(preset: WindowPreset, nowMs: number): DateWindow {
  const today = isoDateOf(nowMs);
  const { fiscalYear } = currentFiscalPeriod(nowMs);
  switch (preset) {
    case 'fytd':
      return { from: fiscalYearStart(fiscalYear), to: today };
    case 'prior-fy':
      return { from: fiscalYearStart(fiscalYear - 1), to: fiscalYearEnd(fiscalYear - 1) };
    case 'this-and-prior-fy':
      return { from: fiscalYearStart(fiscalYear - 1), to: today };
    case 'fy-before-last':
      return { from: fiscalYearStart(fiscalYear - 2), to: fiscalYearEnd(fiscalYear - 2) };
    case 'last-12-months': {
      const year = Number(today.slice(0, 4));
      const month = Number(today.slice(5, 7));
      const day = Number(today.slice(8, 10));
      return { from: isoDateOf(Date.UTC(year - 1, month - 1, day)), to: today };
    }
  }
}
