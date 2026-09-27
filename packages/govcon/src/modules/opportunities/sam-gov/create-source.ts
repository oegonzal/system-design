import type { BudgetPolicy } from '../../../core/budgeted-source';
import type {
  DescribeResult,
  OpportunitySource,
  SourceAvailability,
  SourceFailure,
  SourceResult,
} from '../../../core/ports';
import {
  SAM_GOV_DESCRIPTION_URL,
  SAM_GOV_SEARCH_URL,
  SAM_GOV_SOURCE_ID,
  SamGovSource,
  type SamGovSourceOptions,
} from './sam-gov-source';

/**
 * Environment-driven factory — the only place SAM.gov env vars are read.
 *
 *   SAM_GOV_API_KEY           the account's public API key; absent → disabled source
 *   SAM_GOV_BASE_URL          the search URL (default production; alpha for testing)
 *   SAM_GOV_DESCRIPTION_URL   the notice description URL (default production)
 *   SAM_GOV_DAILY_BUDGET      attempts per rolling day (default 1000, this key's quota; a personal key is commonly 10)
 *   SAM_GOV_CACHE_TTL_HOURS   how long a pulled query is not pulled again (default 24; 0 disables)
 */
export const DEFAULT_DAILY_BUDGET = 1000;
export const DEFAULT_CACHE_TTL_HOURS = 24;

export interface SamGovSettings extends BudgetPolicy {
  apiKey: string | null;
  baseUrl: string;
  descriptionUrl: string;
}

const numberOr = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export function samGovSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): SamGovSettings {
  const key = env['SAM_GOV_API_KEY']?.trim();
  return {
    apiKey: key ? key : null,
    baseUrl: env['SAM_GOV_BASE_URL']?.trim() || SAM_GOV_SEARCH_URL,
    descriptionUrl: env['SAM_GOV_DESCRIPTION_URL']?.trim() || SAM_GOV_DESCRIPTION_URL,
    dailyBudget: Math.floor(numberOr(env['SAM_GOV_DAILY_BUDGET'], DEFAULT_DAILY_BUDGET)),
    ttlMs: numberOr(env['SAM_GOV_CACHE_TTL_HOURS'], DEFAULT_CACHE_TTL_HOURS) * 60 * 60 * 1000,
  };
}

/** The source without a key: says why instead of failing, and never calls anything. */
export class DisabledSource implements OpportunitySource {
  readonly id = SAM_GOV_SOURCE_ID;
  readonly availability: SourceAvailability = { enabled: false, reason: 'no-key' };

  async search(): Promise<SourceResult> {
    return NO_KEY;
  }

  async describe(): Promise<DescribeResult> {
    return NO_KEY;
  }
}

const NO_KEY: SourceFailure = {
  kind: 'error',
  outcome: 'error',
  status: null,
  message: 'SAM_GOV_API_KEY is not set — generate one on your SAM.gov account page',
};

export function createSamGovSourceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: Omit<SamGovSourceOptions, 'apiKey' | 'baseUrl' | 'descriptionUrl'> = {},
): OpportunitySource {
  const settings = samGovSettingsFromEnv(env);
  if (settings.apiKey === null) return new DisabledSource();
  return new SamGovSource({
    ...options,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    descriptionUrl: settings.descriptionUrl,
  });
}

/** Derived facts only — never the key. */
export const samGovAvailabilityFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): SourceAvailability =>
  samGovSettingsFromEnv(env).apiKey === null
    ? { enabled: false, reason: 'no-key' }
    : { enabled: true, reason: null };
