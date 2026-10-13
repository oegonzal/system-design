import type { CountRequest } from '@sysdesign/contracts';
import { z } from 'zod';

import type { Attempted, Fetched } from '../../../core/budget';
import type { AwardCounts, SpendingCounts } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { USASPENDING_DISCLOSURES } from './disclosures';
import { awardTypeCodesOf } from './families';
import { awardFilters } from './filters';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';

const COUNT_PATH = '/api/v2/search/spending_by_award_count/';

const tally = z.number().int().min(0);
const countEnvelopeSchema = z.looseObject({
  results: z.looseObject({ contracts: tally, idvs: tally }),
});

/** The request as USAspending spells it: the filters alone — the answer is one count per award kind. */
export const toCountBody = (request: CountRequest): Record<string, unknown> => ({
  filters: awardFilters(request, awardTypeCodesOf(request.awardFamily)),
});

/** `spending_by_award_count`: how many awards a scope holds over a window, one POST. */
export class UsaSpendingAwardCounts implements SpendingCounts {
  readonly id = USASPENDING_SOURCE_ID;
  readonly disclosures = USASPENDING_DISCLOSURES.awards;

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
  ) {}

  async count(request: CountRequest): Promise<Attempted<Fetched<AwardCounts>>> {
    const { attempts, result } = await this.http.postJson(
      `${this.baseUrl}${COUNT_PATH}`,
      toCountBody(request),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = countEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const { contracts, idvs } = parsed.data.results;
    return {
      attempts,
      result: { kind: 'ok', value: { contracts, idvs }, recordCount: 1, totalRecords: null },
    };
  }
}
