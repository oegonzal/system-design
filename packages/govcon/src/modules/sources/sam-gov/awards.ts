import type { AwardsRequest, SourceAvailability } from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../../../core/budget';
import type { AwardPage, ContractAwards } from '../../../core/ports';
import { issuesOf, SAM_GOV_SOURCE_ID, type SamGovHttp } from './http';
import { samAwardsEnvelopeSchema } from './award-schemas';
import { normalizeSamAward } from './normalize-award';
import { toSamDate } from './search';

/** The Contract Awards search: one GET per page, the key on the request like every SAM.gov API. */
export const SAM_GOV_AWARDS_URL = 'https://api.sam.gov/contract-awards/v1/search';

/** The request under the provider's parameter names — `dateSigned=[MM/dd/yyyy,MM/dd/yyyy]` as it insists. */
export function toSamAwardParams(request: AwardsRequest): URLSearchParams {
  const params = new URLSearchParams();
  params.set('dateSigned', `[${toSamDate(request.from)},${toSamDate(request.to)}]`);
  params.set('limit', String(request.limit));
  params.set('offset', String(request.offset));
  if (request.naics !== null) params.set('naicsCode', request.naics);
  if (request.psc !== null) params.set('pscCode', request.psc);
  return params;
}

export class SamGovAwards implements ContractAwards {
  readonly id = SAM_GOV_SOURCE_ID;
  readonly availability: SourceAvailability = { enabled: true, reason: null };

  constructor(
    private readonly http: SamGovHttp,
    private readonly url = SAM_GOV_AWARDS_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async search(request: AwardsRequest): Promise<Attempted<Fetched<AwardPage>>> {
    const { attempts, result } = await this.http.json(this.url, toSamAwardParams(request));
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = samAwardsEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const awards: AwardPage['awards'] = [];
    let rejected = 0;
    for (const raw of parsed.data.awardSummary ?? []) {
      const normalized = normalizeSamAward(raw, 'sam.gov');
      if (normalized.ok) awards.push(normalized.award);
      else rejected += 1;
    }
    if (rejected > 0) this.warn(`sam.gov awards: ${rejected} record(s) did not normalize`);
    const total = Number(parsed.data.totalRecords);
    const totalRecords = Number.isFinite(total) ? total : null;
    const fetched = request.offset + awards.length + rejected;
    return {
      attempts,
      result: {
        kind: 'ok',
        value: {
          awards,
          rejected,
          totalRecords,
          hasMore: totalRecords !== null ? fetched < totalRecords : awards.length + rejected > 0,
        },
        recordCount: awards.length + rejected,
        totalRecords,
      },
    };
  }
}
