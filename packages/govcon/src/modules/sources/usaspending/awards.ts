import { NO_FACETS, type SourceAvailability, type SpendingRequest } from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../../../core/budget';
import type { AwardPage, SpendingAwards } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { AWARD_TYPE_CODES } from './families';
import { awardFilters } from './filters';
import { normalizeSpendingAward } from './normalize';
import { spendingEnvelopeSchema } from './schemas';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';

/** USAspending's Advanced Award Search: no key, one POST per page; contracts only. */
const SEARCH_PATH = '/api/v2/search/spending_by_award/';
const FIELDS = [
  'Award ID',
  'Recipient Name',
  'Recipient UEI',
  'Award Amount',
  'Awarding Agency',
  'Awarding Agency Code',
  'Awarding Sub Agency',
  'Awarding Sub Agency Code',
  'Contract Award Type',
  'Start Date',
  'End Date',
  'Base Obligation Date',
  'NAICS',
  'PSC',
  'Place of Performance State Code',
  'Place of Performance City Name',
  'generated_internal_id',
];

/** The request as USAspending spells it. */
export function toSpendingBody(request: SpendingRequest): Record<string, unknown> {
  return {
    filters: awardFilters(
      { ...request, agency: null, facets: NO_FACETS },
      AWARD_TYPE_CODES.contracts,
    ),
    fields: FIELDS,
    page: request.page,
    limit: request.limit,
    sort: 'Award Amount',
    order: 'desc',
  };
}

export class UsaSpendingAwards implements SpendingAwards {
  readonly id = USASPENDING_SOURCE_ID;
  readonly availability: SourceAvailability = { enabled: true, reason: null };

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async search(request: SpendingRequest): Promise<Attempted<Fetched<AwardPage>>> {
    const { attempts, result } = await this.http.postJson(
      `${this.baseUrl}${SEARCH_PATH}`,
      toSpendingBody(request),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = spendingEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const awards: AwardPage['awards'] = [];
    let rejected = 0;
    for (const raw of parsed.data.results ?? []) {
      const normalized = normalizeSpendingAward(raw);
      if (normalized.ok) awards.push(normalized.award);
      else rejected += 1;
    }
    if (rejected > 0) this.warn(`usaspending: ${rejected} record(s) did not normalize`);
    return {
      attempts,
      result: {
        kind: 'ok',
        value: {
          awards,
          rejected,
          totalRecords: null,
          hasMore: parsed.data.page_metadata?.hasNext === true,
        },
        recordCount: awards.length + rejected,
        totalRecords: null,
      },
    };
  }
}
