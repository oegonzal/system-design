import { pullScheduleFromEnv } from './pull-schedule';

const HOUR = 60 * 60 * 1000;

describe('the pull schedule', () => {
  it('[GOV-35] reads the pull cadence from GOVCON_PULL_HOURS: a day when it is absent, the hours it names, and zero as never', () => {
    expect(pullScheduleFromEnv({})).toEqual({ everyMs: 24 * HOUR });
    expect(pullScheduleFromEnv({ GOVCON_PULL_HOURS: '12' })).toEqual({ everyMs: 12 * HOUR });
    expect(pullScheduleFromEnv({ GOVCON_PULL_HOURS: '0' })).toEqual({ everyMs: null });
  });
});
