import type { NoRequest } from '@sysdesign/contracts';

import type { LensSpec } from '../lens';
import { freshnessBodySchema, type FreshnessBody } from '../schemas';
import { spend, type LensDeps } from './deps';

/** The source's own "award data as of" — one request a day, shared by every lens that states it. */
export const freshnessLens = (deps: LensDeps): LensSpec<NoRequest, FreshnessBody> => ({
  lens: 'freshness',
  source: deps.sources.freshness.id,
  schema: freshnessBodySchema,
  disclosures: deps.sources.freshness.disclosures,
  async load() {
    const tally = { requests: 0 };
    const spent = await spend(
      deps,
      tally,
      { source: deps.sources.freshness.id, operation: 'freshness', query: {} },
      () => deps.sources.freshness.lastUpdated(),
    );
    if (spent.kind !== 'ok') return spent;
    return {
      kind: 'ok',
      body: { lastUpdated: spent.value },
      asOf: spent.value,
      requests: tally.requests,
    };
  },
});
