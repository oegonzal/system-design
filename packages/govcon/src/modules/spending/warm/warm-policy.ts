import { numberOr } from '../../sources/env';

/**
 *   GOVCON_SPENDING_WARM_HOURS  how often the default profile's spending lenses are refreshed (default 24; 0 never)
 */
export const DEFAULT_SPENDING_WARM_HOURS = 24;

export interface SpendingWarmPolicy {
  /** Time between warms; null never warms. */
  everyMs: number | null;
}

export function spendingWarmPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SpendingWarmPolicy {
  const hours = numberOr(env['GOVCON_SPENDING_WARM_HOURS'], DEFAULT_SPENDING_WARM_HOURS);
  return { everyMs: hours === 0 ? null : hours * 60 * 60 * 1000 };
}
