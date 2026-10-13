import { spendingWarmPolicyFromEnv } from './warm-policy';

const HOUR = 60 * 60 * 1000;

describe('the spending warm policy', () => {
  it('[GOV-22] reads the warm cadence from the environment: the default, a value in hours, zero as never, and nonsense as the default', () => {
    expect(spendingWarmPolicyFromEnv({})).toEqual({ everyMs: 24 * HOUR });
    expect(spendingWarmPolicyFromEnv({ GOVCON_SPENDING_WARM_HOURS: '6' })).toEqual({
      everyMs: 6 * HOUR,
    });
    expect(spendingWarmPolicyFromEnv({ GOVCON_SPENDING_WARM_HOURS: '0' })).toEqual({
      everyMs: null,
    });
    expect(spendingWarmPolicyFromEnv({ GOVCON_SPENDING_WARM_HOURS: 'often' })).toEqual({
      everyMs: 24 * HOUR,
    });
  });
});
