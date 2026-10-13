import { daysBefore, type PublicationDelay } from '@sysdesign/contracts';

import type { PublicationLag } from '../ports';

/**
 * What a scope is still missing, from the lags the source declares. A scope
 * of every agency counts each agency that publishes late; a scope of one
 * agency counts that one or none. The last day that is all in is the
 * source's "data as of" less the longest lag that bears on the scope, so
 * anything later is still filling in. Null when no lag bears on the scope.
 */
export function publicationDelay(
  lags: readonly PublicationLag[],
  agency: string | null,
  asOf: string,
): PublicationDelay | null {
  const bearing = lags.filter(
    (lag) => lag.days > 0 && (agency === null || lag.toptierCode === agency),
  );
  if (bearing.length === 0) return null;
  const days = Math.max(...bearing.map((lag) => lag.days));
  return {
    agencies: bearing.map((lag) => lag.name),
    days,
    completeThrough: daysBefore(asOf, days),
  };
}
