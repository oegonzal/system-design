import type { BudgetPolicy } from '../../../core/budgeted-source';
import type { OpportunitySource, SourceAvailability, SourceResult } from '../../../core/ports';
import {
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
 *   SAM_GOV_DAILY_BUDGET      attempts per rolling day (default 10 — a personal key's commonly reported quota)
 *   SAM_GOV_CACHE_TTL_HOURS   how long a pulled query is not pulled again (default 24; 0 disables)
 */
export const DEFAULT_DAILY_BUDGET = 10;
export const DEFAULT_CACHE_TTL_HOURS = 24;

export interface SamGovSettings extends BudgetPolicy {
  apiKey: string | null;
  baseUrl: string;
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
    dailyBudget: Math.floor(numberOr(env['SAM_GOV_DAILY_BUDGET'], DEFAULT_DAILY_BUDGET)),
    ttlMs: numberOr(env['SAM_GOV_CACHE_TTL_HOURS'], DEFAULT_CACHE_TTL_HOURS) * 60 * 60 * 1000,
  };
}

/** The source without a key: says why instead of failing, and never calls anything. */
export class DisabledSource implements OpportunitySource {
  readonly id = SAM_GOV_SOURCE_ID;
  readonly availability: SourceAvailability = { enabled: false, reason: 'no-key' };

  async search(): Promise<SourceResult> {
    return {
      kind: 'error',
      outcome: 'error',
      status: null,
      message: 'SAM_GOV_API_KEY is not set — generate one on your SAM.gov account page',
    };
  }
}

export function createSamGovSourceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: Omit<SamGovSourceOptions, 'apiKey' | 'baseUrl'> = {},
): OpportunitySource {
  const settings = samGovSettingsFromEnv(env);
  if (settings.apiKey === null) return new DisabledSource();
  return new SamGovSource({ ...options, apiKey: settings.apiKey, baseUrl: settings.baseUrl });
}

/** Derived facts only — never the key. */
export const samGovAvailabilityFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): SourceAvailability =>
  samGovSettingsFromEnv(env).apiKey === null
    ? { enabled: false, reason: 'no-key' }
    : { enabled: true, reason: null };
