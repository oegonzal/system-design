import type { SourceAvailability, SpendingRequest } from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../../../core/budget';
import type { AwardPage, SpendingAwards } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { normalizeSpendingAward } from './normalize';
import { spendingEnvelopeSchema } from './schemas';

/** USAspending's Advanced Award Search: no key, one POST per page. */
export const USASPENDING_SOURCE_ID = 'usaspending';
export const USASPENDING_BASE_URL = 'https://api.usaspending.gov';
const SEARCH_PATH = '/api/v2/search/spending_by_award/';

/** Contracts only (definitive, purchase orders, delivery orders, BPA calls). */
const CONTRACT_AWARD_TYPES = ['A', 'B', 'C', 'D'];
const FIELDS = [
  'Award ID',
  'Recipient Name',
  'Recipient UEI',
  'Award Amount',
  'Awarding Agency',
  'Awarding Sub Agency',
  'Start Date',
  'End Date',
  'NAICS',
  'PSC',
  'Place of Performance State Code',
  'Place of Performance City Name',
  'generated_internal_id',
];

/** The request as USAspending spells it. */
export function toSpendingBody(request: SpendingRequest): Record<string, unknown> {
  return {
    filters: {
      time_period: [{ start_date: request.from, end_date: request.to }],
      award_type_codes: CONTRACT_AWARD_TYPES,
      ...(request.naics.length > 0 ? { naics_codes: { require: request.naics } } : {}),
      ...(request.psc.length > 0 ? { psc_codes: { require: request.psc } } : {}),
    },
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
