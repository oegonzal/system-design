import type { OpportunityQuery, SourceAvailability } from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../../../core/budget';
import type { OpportunitySearch, SearchPage } from '../../../core/ports';
import { issuesOf, SAM_GOV_SOURCE_ID, type SamGovHttp } from './http';
import { normalizePage } from './normalize';
import { samEnvelopeSchema } from './schemas';

/** The Contract Opportunities search; the alpha environment answers a prodlike key for testing. */
export const SAM_GOV_SEARCH_URL = 'https://api.sam.gov/opportunities/v2/search';
export const SAM_GOV_ALPHA_SEARCH_URL = 'https://api-alpha.sam.gov/opportunities/v2/search';

/** `2026-09-20` → `09/20/2026`, the only date spelling the API accepts. */
export const toSamDate = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
};

/** Each filter under the provider's parameter name, as data. */
const PARAMS: readonly [keyof OpportunityQuery, string, (value: string) => string][] = [
  ['noticeType', 'ptype', String],
  ['naics', 'ncode', String],
  ['psc', 'ccode', String],
  ['setAside', 'typeOfSetAside', String],
  ['status', 'status', String],
  ['title', 'title', String],
  ['solicitationNumber', 'solnum', String],
  ['noticeId', 'noticeid', String],
  ['state', 'state', String],
  ['zip', 'zip', String],
  ['organizationName', 'organizationName', String],
  ['organizationCode', 'organizationCode', String],
  ['deadlineFrom', 'rdlfrom', toSamDate],
  ['deadlineTo', 'rdlto', toSamDate],
];

/** The query under the provider's parameter names — never the key. */
export function toSamParams(query: OpportunityQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set('postedFrom', toSamDate(query.postedFrom));
  params.set('postedTo', toSamDate(query.postedTo));
  params.set('limit', String(query.limit));
  params.set('offset', String(query.offset));
  for (const [field, name, render] of PARAMS) {
    const value = query[field];
    if (value !== undefined) params.set(name, render(String(value)));
  }
  return params;
}

export class SamGovSearch implements OpportunitySearch {
  readonly id = SAM_GOV_SOURCE_ID;
  readonly availability: SourceAvailability = { enabled: true, reason: null };

  constructor(
    private readonly http: SamGovHttp,
    private readonly url = SAM_GOV_SEARCH_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async search(query: OpportunityQuery): Promise<Attempted<Fetched<SearchPage>>> {
    const { attempts, result } = await this.http.json(this.url, toSamParams(query));
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = samEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const page = normalizePage(parsed.data.opportunitiesData ?? [], this.id);
    if (page.rejected.length > 0) {
      this.warn(`sam.gov: ${page.rejected.length} record(s) did not normalize`);
    }
    return {
      attempts,
      result: {
        kind: 'ok',
        value: { ...page, totalRecords: parsed.data.totalRecords },
        recordCount: page.opportunities.length + page.rejected.length,
        totalRecords: parsed.data.totalRecords,
      },
    };
  }
}
