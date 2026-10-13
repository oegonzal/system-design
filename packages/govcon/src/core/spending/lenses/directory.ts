import type { AgencyDirectory, NoRequest } from '@sysdesign/contracts';

import type { LensBody, LensSpec } from '../lens';
import { directoryBodySchema } from '../schemas';
import { spend, type LensDeps } from './deps';

/** Every toptier agency with its budget authority — reference data every scoped lens resolves a code through. */
export const directoryLens = (deps: LensDeps): LensSpec<NoRequest, LensBody<AgencyDirectory>> => ({
  lens: 'agencies',
  source: deps.sources.catalog.id,
  schema: directoryBodySchema,
  disclosures: deps.sources.catalog.disclosures,
  async load() {
    const tally = { requests: 0 };
    const spent = await spend(
      deps,
      tally,
      { source: deps.sources.catalog.id, operation: 'agency-directory', query: {} },
      () => deps.sources.catalog.agencies(),
    );
    if (spent.kind !== 'ok') return spent;
    return { kind: 'ok', body: { entries: spent.value }, asOf: null, requests: tally.requests };
  },
});
