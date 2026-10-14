import { cadenceOfHours, type Cadence } from '../../app/serve-job';

/**
 *   GOVCON_SPENDING_WARM_HOURS  how often the default profile's spending lenses are refreshed (default 24; 0 never)
 */
const DEFAULT_SPENDING_WARM_HOURS = 24;

export const spendingWarmPolicyFromEnv = (env: NodeJS.ProcessEnv = process.env): Cadence =>
  cadenceOfHours(env['GOVCON_SPENDING_WARM_HOURS'], DEFAULT_SPENDING_WARM_HOURS);
