import { AttemptedHttp, type AttemptedHttpOptions } from '../http';

export { issuesOf, RETRY_POLICY } from '../http';
export type { Sleep } from '../http';

export const SAM_GOV_SOURCE_ID = 'sam.gov';

export interface SamGovHttpOptions extends Omit<AttemptedHttpOptions, 'decorate' | 'secrets'> {
  apiKey: string;
}

/**
 * SAM.gov's transport: every API the key reaches is a request with the key
 * in the query string, so this is the one place the key is appended and the
 * one place it is redacted from provider strings.
 */
export class SamGovHttp extends AttemptedHttp {
  constructor({ apiKey, ...options }: SamGovHttpOptions) {
    super({
      ...options,
      decorate: (target) => target.searchParams.set('api_key', apiKey),
      secrets: [{ value: apiKey, label: '[api_key]' }],
    });
  }
}
