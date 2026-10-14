import { spendingWarmPolicyFromEnv } from './warm-policy';

const HOUR = 60 * 60 * 1000;

describe('the spending warm policy', () => {
  it('[GOV-22] reads the warm cadence from GOVCON_SPENDING_WARM_HOURS: a day when it is absent, the hours it names, and zero as never', () => {
    expect(spendingWarmPolicyFromEnv({})).toEqual({ everyMs: 24 * HOUR });
    expect(spendingWarmPolicyFromEnv({ GOVCON_SPENDING_WARM_HOURS: '6' })).toEqual({
      everyMs: 6 * HOUR,
    });
    expect(spendingWarmPolicyFromEnv({ GOVCON_SPENDING_WARM_HOURS: '0' })).toEqual({
      everyMs: null,
    });
  });
});
