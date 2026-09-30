import { AttemptedHttp, type AttemptedHttpOptions } from '../http';
import { USASPENDING_BASE_URL, UsaSpendingAwards } from './awards';

/**
 *   USASPENDING_BASE_URL   the API host (default production). No key: the API is open.
 */
export function createUsaSpendingSources(
  env: NodeJS.ProcessEnv = process.env,
  options: AttemptedHttpOptions & { warn?: (message: string) => void } = {},
): { awards: UsaSpendingAwards } {
  const { warn, ...http } = options;
  const baseUrl = env['USASPENDING_BASE_URL']?.trim() || USASPENDING_BASE_URL;
  return { awards: new UsaSpendingAwards(new AttemptedHttp(http), baseUrl, warn) };
}
