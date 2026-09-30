import type { BudgetPolicy } from '../../../core/budget';
import type {
  ContractAwards,
  EntityRegistry,
  NoticeDescriptions,
  OpportunitySearch,
} from '../../../core/ports';
import { SAM_GOV_AWARDS_URL, SamGovAwards } from './awards';
import { SAM_GOV_DESCRIPTION_URL, SamGovDescriptions } from './descriptions';
import { DisabledAwards, DisabledDescriptions, DisabledRegistry, DisabledSearch } from './disabled';
import { SAM_GOV_ENTITIES_URL, SamGovEntities } from './entities';
import { SAM_GOV_SOURCE_ID, SamGovHttp, type SamGovHttpOptions } from './http';
import { SAM_GOV_SEARCH_URL, SamGovSearch } from './search';

/**
 * Environment-driven factories — the only place the SAM.gov and budget env
 * vars are read.
 *
 *   SAM_GOV_API_KEY               the account's public API key; absent → disabled sources
 *   SAM_GOV_BASE_URL              the search URL (default production; alpha for testing)
 *   SAM_GOV_DESCRIPTION_URL       the notice description URL (default production)
 *   SAM_GOV_AWARDS_URL            the Contract Awards search URL (default production)
 *   SAM_GOV_ENTITIES_URL          the Entity Management URL (default production)
 *   SAM_GOV_DAILY_BUDGET          attempts per rolling day against SAM.gov, every API and outcome counted (default 1000, this key's quota)
 *   SAM_GOV_CACHE_TTL_HOURS       how long a pulled query is not pulled again (default 24; 0 disables)
 *   GOVCON_PULL_DEADLINE_SECONDS  a pull starts no new slice after this long (default 120)
 */
export const DEFAULT_DAILY_BUDGET = 1000;
export const DEFAULT_CACHE_TTL_HOURS = 24;
export const DEFAULT_PULL_DEADLINE_SECONDS = 120;

/** What reaches the provider: the key and the URLs. Never part of the budget. */
export interface SamGovCredentials {
  apiKey: string;
  searchUrl: string;
  descriptionUrl: string;
  awardsUrl: string;
  entitiesUrl: string;
}

const numberOr = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/** The credentials, or null without a key. */
export function samGovCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SamGovCredentials | null {
  const apiKey = env['SAM_GOV_API_KEY']?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    searchUrl: env['SAM_GOV_BASE_URL']?.trim() || SAM_GOV_SEARCH_URL,
    descriptionUrl: env['SAM_GOV_DESCRIPTION_URL']?.trim() || SAM_GOV_DESCRIPTION_URL,
    awardsUrl: env['SAM_GOV_AWARDS_URL']?.trim() || SAM_GOV_AWARDS_URL,
    entitiesUrl: env['SAM_GOV_ENTITIES_URL']?.trim() || SAM_GOV_ENTITIES_URL,
  };
}

export function budgetPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): BudgetPolicy {
  return {
    ttlMs: numberOr(env['SAM_GOV_CACHE_TTL_HOURS'], DEFAULT_CACHE_TTL_HOURS) * 60 * 60 * 1000,
    pullDeadlineMs:
      numberOr(env['GOVCON_PULL_DEADLINE_SECONDS'], DEFAULT_PULL_DEADLINE_SECONDS) * 1000,
    buckets: {
      [SAM_GOV_SOURCE_ID]: {
        dailyBudget: Math.floor(numberOr(env['SAM_GOV_DAILY_BUDGET'], DEFAULT_DAILY_BUDGET)),
      },
    },
  };
}

export interface SamGovSources {
  search: OpportunitySearch;
  descriptions: NoticeDescriptions;
  awards: ContractAwards;
  entities: EntityRegistry;
}

export function createSamGovSources(
  env: NodeJS.ProcessEnv = process.env,
  options: Omit<SamGovHttpOptions, 'apiKey'> & { warn?: (message: string) => void } = {},
): SamGovSources {
  const credentials = samGovCredentialsFromEnv(env);
  if (credentials === null) {
    return {
      search: new DisabledSearch(),
      descriptions: new DisabledDescriptions(),
      awards: new DisabledAwards(),
      entities: new DisabledRegistry(),
    };
  }
  const { warn, ...http } = options;
  const transport = new SamGovHttp({ ...http, apiKey: credentials.apiKey });
  return {
    search: new SamGovSearch(transport, credentials.searchUrl, warn),
    descriptions: new SamGovDescriptions(transport, credentials.descriptionUrl),
    awards: new SamGovAwards(transport, credentials.awardsUrl, warn),
    entities: new SamGovEntities(transport, credentials.entitiesUrl, warn),
  };
}
