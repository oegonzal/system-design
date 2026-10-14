import { cadenceOfHours, type Cadence } from '../app/serve-job';

/**
 *   GOVCON_PULL_HOURS  how often the default profile's daily pull runs under `serve` (default 24; 0 never)
 */
const DEFAULT_PULL_HOURS = 24;

export const pullScheduleFromEnv = (env: NodeJS.ProcessEnv = process.env): Cadence =>
  cadenceOfHours(env['GOVCON_PULL_HOURS'], DEFAULT_PULL_HOURS);
