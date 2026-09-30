import type { PullReport } from './pull';

/**
 * The formatting the CLI's tables and the web client's cells share, pure and
 * zone-free: dates render as their ISO date, never through the machine's
 * clock; money as whole dollars. Presentation only — nothing here decides.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export const DASH = '—';

export const day = (iso: string | null): string => (iso === null ? DASH : iso.slice(0, 10));

export const minute = (iso: string): string => iso.slice(0, 16).replace('T', ' ');

/** The office at the end of SAM.gov's dotted agency path. */
export const agencyOf = (path: string | null): string | null => {
  if (path === null) return null;
  const parts = path.split('.').filter((part) => part.trim().length > 0);
  return parts[parts.length - 1] ?? path;
};

export const clip = (text: string | null, width: number): string => {
  const value = text ?? DASH;
  return value.length > width ? `${value.slice(0, width - 1)}…` : value;
};

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export const money = (amount: number | null): string =>
  amount === null ? DASH : dollars.format(amount);

/** Whole days from `nowMs` to the ISO instant, rounded up; null without a date. */
export const daysUntil = (iso: string | null, nowMs: number): number | null => {
  if (iso === null) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : Math.ceil((at - nowMs) / DAY_MS);
};

/** The file name at the end of an attachment URL's path, decoded; the URL itself when the path has none. */
export const attachmentName = (url: string): string => {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split('?')[0] ?? url;
  }
  const last = pathname.split('/').filter(Boolean).pop();
  if (!last) return url;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

/** The pull's budget line, as the CLI prints it and the client shows it. */
export function summarizePull(report: PullReport): string {
  const stored = report.slices.reduce((total, slice) => total + slice.inserted + slice.updated, 0);
  const count = (outcome: string) =>
    report.slices.filter((slice) => slice.outcome === outcome).length;
  const notPulled = count('budget-exhausted') + count('skipped');
  const spent = report.spent === null ? '?' : String(report.spent);
  const stopped = report.stoppedBy ? ` (stopped: ${report.stoppedBy})` : '';
  return `${spent} of ${report.budget} attempts used in the last 24 h · ${stored} stored · ${count('cached')} cached · ${notPulled} not pulled${stopped}`;
}
