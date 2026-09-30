import type { SourceInfo, SourceStatus } from '@sysdesign/contracts';

/** The budgeted upstream — the one a pull or a search needs; a free source never blocks either. */
export const budgetedSource = (status: SourceStatus | null): SourceInfo | null =>
  status?.sources.find((source) => source.bucket !== null) ?? status?.sources[0] ?? null;

/** Why the budgeted source cannot be called, as a sentence for the page; null when it can. */
export function sourceDisabledReason(status: SourceStatus | null): string | null {
  const source = budgetedSource(status);
  if (source === null || source.availability.enabled) return null;
  return source.availability.reason === 'no-key'
    ? 'SAM_GOV_API_KEY is not set (no-key)'
    : 'the source is disabled';
}
