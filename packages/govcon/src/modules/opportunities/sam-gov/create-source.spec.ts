import {
  createSamGovSourceFromEnv,
  DEFAULT_CACHE_TTL_HOURS,
  DEFAULT_DAILY_BUDGET,
  DisabledSource,
  samGovAvailabilityFromEnv,
  samGovSettingsFromEnv,
} from './create-source';
import {
  SAM_GOV_ALPHA_SEARCH_URL,
  SAM_GOV_DESCRIPTION_URL,
  SAM_GOV_SEARCH_URL,
  SamGovSource,
} from './sam-gov-source';

describe('the SAM.gov environment factory', () => {
  it('[GOV-7] is the only reader of the key, and yields a disabled source that explains itself without one', async () => {
    const source = createSamGovSourceFromEnv({});
    expect(source).toBeInstanceOf(DisabledSource);
    expect(source.availability).toEqual({ enabled: false, reason: 'no-key' });
    expect(samGovAvailabilityFromEnv({ SAM_GOV_API_KEY: '   ' })).toEqual({
      enabled: false,
      reason: 'no-key',
    });
    const result = await source.search({
      postedFrom: '2026-01-01',
      postedTo: '2026-01-02',
      limit: 1,
      offset: 0,
    });
    expect(result).toMatchObject({ kind: 'error', outcome: 'error', status: null });
    expect(result.kind === 'error' && result.message).toContain('SAM_GOV_API_KEY');
    expect(await source.describe('n-1')).toEqual(result);
  });

  it('yields the live source with a key, on the production URL unless told otherwise', () => {
    expect(createSamGovSourceFromEnv({ SAM_GOV_API_KEY: 'k' })).toBeInstanceOf(SamGovSource);
    expect(samGovAvailabilityFromEnv({ SAM_GOV_API_KEY: 'k' })).toEqual({
      enabled: true,
      reason: null,
    });
    expect(samGovSettingsFromEnv({ SAM_GOV_API_KEY: 'k' })).toEqual({
      apiKey: 'k',
      baseUrl: SAM_GOV_SEARCH_URL,
      descriptionUrl: SAM_GOV_DESCRIPTION_URL,
      dailyBudget: DEFAULT_DAILY_BUDGET,
      ttlMs: DEFAULT_CACHE_TTL_HOURS * 60 * 60 * 1000,
    });
    expect(
      samGovSettingsFromEnv({
        SAM_GOV_API_KEY: 'k',
        SAM_GOV_BASE_URL: SAM_GOV_ALPHA_SEARCH_URL,
        SAM_GOV_DESCRIPTION_URL: 'https://api-alpha.sam.gov/prod/opportunities/v1/noticedesc',
        SAM_GOV_DAILY_BUDGET: '2',
        SAM_GOV_CACHE_TTL_HOURS: '0',
      }),
    ).toEqual({
      apiKey: 'k',
      baseUrl: SAM_GOV_ALPHA_SEARCH_URL,
      descriptionUrl: 'https://api-alpha.sam.gov/prod/opportunities/v1/noticedesc',
      dailyBudget: 2,
      ttlMs: 0,
    });
  });

  it('falls back to the defaults for a budget or ttl it cannot read', () => {
    const settings = samGovSettingsFromEnv({
      SAM_GOV_API_KEY: 'k',
      SAM_GOV_DAILY_BUDGET: 'lots',
      SAM_GOV_CACHE_TTL_HOURS: '-1',
    });
    expect(settings.dailyBudget).toBe(DEFAULT_DAILY_BUDGET);
    expect(settings.ttlMs).toBe(DEFAULT_CACHE_TTL_HOURS * 60 * 60 * 1000);
  });
});
