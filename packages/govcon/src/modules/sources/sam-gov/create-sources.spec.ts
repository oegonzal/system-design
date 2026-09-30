import {
  budgetPolicyFromEnv,
  createSamGovSources,
  DEFAULT_CACHE_TTL_HOURS,
  DEFAULT_DAILY_BUDGET,
  DEFAULT_PULL_DEADLINE_SECONDS,
  samGovAvailabilityFromEnv,
  samGovCredentialsFromEnv,
} from './create-sources';
import { SAM_GOV_AWARDS_URL, SamGovAwards } from './awards';
import { SAM_GOV_DESCRIPTION_URL, SamGovDescriptions } from './descriptions';
import { DisabledDescriptions, DisabledSearch } from './disabled';
import { SAM_GOV_ENTITIES_URL, SamGovEntities } from './entities';
import { SAM_GOV_ALPHA_SEARCH_URL, SAM_GOV_SEARCH_URL, SamGovSearch } from './search';

describe('the SAM.gov environment factory', () => {
  it('[GOV-7] is the only reader of the key, and yields disabled sources that explain themselves without one', async () => {
    const { search, descriptions } = createSamGovSources({});
    expect(search).toBeInstanceOf(DisabledSearch);
    expect(descriptions).toBeInstanceOf(DisabledDescriptions);
    expect(search.availability).toEqual({ enabled: false, reason: 'no-key' });
    expect(samGovAvailabilityFromEnv({ SAM_GOV_API_KEY: '   ' })).toEqual({
      enabled: false,
      reason: 'no-key',
    });
    expect(samGovCredentialsFromEnv({})).toBeNull();
    const { attempts, result } = await search.search({
      postedFrom: '2026-01-01',
      postedTo: '2026-01-02',
      limit: 1,
      offset: 0,
    });
    expect(attempts).toEqual([]);
    expect(result).toMatchObject({ kind: 'error', outcome: 'error', status: null });
    expect(result.kind === 'error' && result.message).toContain('SAM_GOV_API_KEY');
    expect((await descriptions.get('n-1')).result).toEqual(result);
  });

  it('yields the live sources with a key, on the production URLs unless told otherwise', () => {
    const live = createSamGovSources({ SAM_GOV_API_KEY: 'k' });
    expect(live.search).toBeInstanceOf(SamGovSearch);
    expect(live.descriptions).toBeInstanceOf(SamGovDescriptions);
    expect(live.awards).toBeInstanceOf(SamGovAwards);
    expect(live.entities).toBeInstanceOf(SamGovEntities);
    expect(samGovAvailabilityFromEnv({ SAM_GOV_API_KEY: 'k' })).toEqual({
      enabled: true,
      reason: null,
    });
    expect(samGovCredentialsFromEnv({ SAM_GOV_API_KEY: 'k' })).toEqual({
      apiKey: 'k',
      searchUrl: SAM_GOV_SEARCH_URL,
      descriptionUrl: SAM_GOV_DESCRIPTION_URL,
      awardsUrl: SAM_GOV_AWARDS_URL,
      entitiesUrl: SAM_GOV_ENTITIES_URL,
    });
    expect(
      samGovCredentialsFromEnv({
        SAM_GOV_API_KEY: 'k',
        SAM_GOV_BASE_URL: SAM_GOV_ALPHA_SEARCH_URL,
        SAM_GOV_DESCRIPTION_URL: 'https://api-alpha.sam.gov/prod/opportunities/v1/noticedesc',
      }),
    ).toEqual({
      apiKey: 'k',
      searchUrl: SAM_GOV_ALPHA_SEARCH_URL,
      descriptionUrl: 'https://api-alpha.sam.gov/prod/opportunities/v1/noticedesc',
      awardsUrl: SAM_GOV_AWARDS_URL,
      entitiesUrl: SAM_GOV_ENTITIES_URL,
    });
  });

  it('[GOV-11] reads the budget as one bucket for every SAM.gov operation, with defaults for what it cannot read', () => {
    expect(budgetPolicyFromEnv({})).toEqual({
      ttlMs: DEFAULT_CACHE_TTL_HOURS * 60 * 60 * 1000,
      pullDeadlineMs: DEFAULT_PULL_DEADLINE_SECONDS * 1000,
      buckets: { 'sam.gov': { dailyBudget: DEFAULT_DAILY_BUDGET } },
    });
    expect(
      budgetPolicyFromEnv({
        SAM_GOV_DAILY_BUDGET: '2',
        SAM_GOV_CACHE_TTL_HOURS: '0',
        GOVCON_PULL_DEADLINE_SECONDS: '5',
      }),
    ).toEqual({ ttlMs: 0, pullDeadlineMs: 5000, buckets: { 'sam.gov': { dailyBudget: 2 } } });
    const odd = budgetPolicyFromEnv({
      SAM_GOV_DAILY_BUDGET: 'lots',
      SAM_GOV_CACHE_TTL_HOURS: '-1',
    });
    expect(odd.buckets['sam.gov']?.dailyBudget).toBe(DEFAULT_DAILY_BUDGET);
    expect(odd.ttlMs).toBe(DEFAULT_CACHE_TTL_HOURS * 60 * 60 * 1000);
  });
});
