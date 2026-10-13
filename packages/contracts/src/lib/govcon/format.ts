import { DUE_SOON_DAYS } from './constants';
import type { PullReport } from './pull';

/**
 * The formatting the CLI's tables and the web client's cells share, pure and
 * zone-free: dates render as their ISO date, never through the machine's
 * clock; money as whole dollars. Presentation, plus the one date rule both
 * sides count by (`isDueSoonAt`); every instant is the caller's `nowMs`.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export const DASH = '—';

export const day = (iso: string | null): string => (iso === null ? DASH : iso.slice(0, 10));

export const minute = (iso: string): string => iso.slice(0, 16).replace('T', ' ');

/** The office at the end of a dotted agency path, as SAM.gov writes one. */
export const agencyOf = (path: string | null): string | null => {
  if (path === null) return null;
  const parts = path
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
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

const compactDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Money as an axis tick or a tile figure reads it: `$1.2M`, `$850K`, `-$3.4M`. */
export const compactMoney = (amount: number | null): string =>
  amount === null ? DASH : compactDollars.format(amount);

/** Whole days from `nowMs` to the ISO instant, rounded up; null without a date. */
export const daysUntil = (iso: string | null, nowMs: number): number | null => {
  if (iso === null) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : Math.ceil((at - nowMs) / DAY_MS);
};

/**
 * Whether any mark — a reminder, a deadline, as ISO instants — falls inside
 * `DUE_SOON_DAYS` of `nowMs`, or has passed. The one rule the server's
 * pipeline count and the client's due list both apply.
 */
export const isDueSoonAt = (marks: readonly (string | null)[], nowMs: number): boolean =>
  marks.some((mark) => {
    const days = daysUntil(mark, nowMs);
    return days !== null && days <= DUE_SOON_DAYS;
  });

/** Which rows a page shows of the whole: `1–10 of 24`, or `0 of 0` for an empty page. */
export const rangeLabel = (offset: number, count: number, total: number): string =>
  count === 0 ? `0 of ${total}` : `${offset + 1}–${offset + count} of ${total}`;

/** Whole days until a mark, as a cell reads it: `3 day(s)`, `today`, `2 day(s) ago`, or a dash. */
export const daysLeftLabel = (days: number | null): string =>
  days === null ? DASH : days < 0 ? `${-days} day(s) ago` : days === 0 ? 'today' : `${days} day(s)`;

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
