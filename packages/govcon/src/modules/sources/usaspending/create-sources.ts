import type { SpendingSources } from '../../../core/ports';
import { AttemptedHttp, type AttemptedHttpOptions } from '../http';
import { UsaSpendingAgencyBudgets } from './agency-budgets';
import { UsaSpendingAgencyCatalog } from './agency-catalog';
import { UsaSpendingAgencyOffices } from './agency-offices';
import { UsaSpendingAwardCounts } from './award-counts';
import { UsaSpendingAwards } from './awards';
import { UsaSpendingBreakdowns } from './breakdowns';
import { UsaSpendingEndingAwards } from './ending-awards';
import { UsaSpendingFreshness } from './freshness';
import { UsaSpendingSeries } from './series';
import { USASPENDING_BASE_URL } from './source';

/**
 *   USASPENDING_BASE_URL   the API host (default production). No key: the API is open.
 *
 * Every adapter rides one transport and one base URL: the award search the
 * intel page fetches with, and every capability the spending lenses read
 * through.
 */
export function createUsaSpendingSources(
  env: NodeJS.ProcessEnv = process.env,
  options: AttemptedHttpOptions & { warn?: (message: string) => void } = {},
): { awards: UsaSpendingAwards; spending: SpendingSources } {
  const { warn, ...transport } = options;
  const http = new AttemptedHttp(transport);
  const baseUrl = env['USASPENDING_BASE_URL']?.trim() || USASPENDING_BASE_URL;
  return {
    awards: new UsaSpendingAwards(http, baseUrl, warn),
    spending: {
      series: new UsaSpendingSeries(http, baseUrl, warn),
      breakdowns: new UsaSpendingBreakdowns(http, baseUrl, warn),
      ending: new UsaSpendingEndingAwards(http, baseUrl, warn),
      counts: new UsaSpendingAwardCounts(http, baseUrl),
      budgets: new UsaSpendingAgencyBudgets(http, baseUrl, warn),
      offices: new UsaSpendingAgencyOffices(http, baseUrl, warn),
      catalog: new UsaSpendingAgencyCatalog(http, baseUrl, warn),
      freshness: new UsaSpendingFreshness(http, baseUrl),
    },
  };
}
