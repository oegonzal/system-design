import type { SourceAvailability } from '@sysdesign/contracts';

import type { Attempted, Fetched, SourceFailure } from '../../../core/budget';
import type { NoticeDescriptions, OpportunitySearch } from '../../../core/ports';
import { SAM_GOV_SOURCE_ID } from './http';

/**
 * The sources without a key: they say why instead of failing, and make no
 * attempt — so nothing is ledgered and nothing is spent.
 */
const NO_KEY: SourceFailure = {
  kind: 'error',
  outcome: 'error',
  status: null,
  message: 'SAM_GOV_API_KEY is not set — generate one on your SAM.gov account page',
};

const DISABLED: SourceAvailability = { enabled: false, reason: 'no-key' };

const nothing = <T>(): Promise<Attempted<Fetched<T>>> =>
  Promise.resolve({ attempts: [], result: NO_KEY });

export class DisabledSearch implements OpportunitySearch {
  readonly id = SAM_GOV_SOURCE_ID;
  readonly availability = DISABLED;
  search = nothing;
}

export class DisabledDescriptions implements NoticeDescriptions {
  readonly id = SAM_GOV_SOURCE_ID;
  readonly availability = DISABLED;
  get = nothing;
}
