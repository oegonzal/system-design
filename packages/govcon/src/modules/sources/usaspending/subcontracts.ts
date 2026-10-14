import type { FacetId, SubawardScopeRequest, SubawardsRequest } from '@sysdesign/contracts';
import { z } from 'zod';

import type { Attempted, Fetched } from '../../../core/budget';
import type { SubcontractPage, SubcontractRow, Subcontracts } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { USASPENDING_DISCLOSURES } from './disclosures';
import { AWARD_TYPE_CODES } from './families';
import { awardFilters } from './filters';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';
import { amount, clean, day } from './values';

const COUNT_PATH = '/api/v2/search/spending_by_award_count/';
const ROWS_PATH = '/api/v2/search/spending_by_award/';
/** The field a page is sorted by: the most recent subcontract first. */
const DATE_FIELD = 'Sub-Award Date';
const FIELDS = [
  'Sub-Award ID',
  'Sub-Awardee Name',
  'Sub-Recipient UEI',
  DATE_FIELD,
  'Sub-Award Amount',
  'Prime Recipient Name',
  'Prime Award Recipient UEI',
  'prime_award_generated_internal_id',
  'PSC',
];

/**
 * What a subcontract search cannot honour. Measured 2026-10-13 on the count
 * endpoint with `subawards: true`: `award_amounts` bounds the subcontract's
 * own amount, so a prime award's size cannot be asked for, and a window's
 * `date_type: new_awards_only` answers a 500. Every other facet narrows by
 * a fact about the prime award — its type, set-aside, winner's size — and
 * `recipient_search_text` matches the subcontractor.
 */
const UNSUPPORTED_FACETS: readonly FacetId[] = ['amount', 'newOnly'];

const text = z.string().nullish();
const subcontractSchema = z.looseObject({
  'Sub-Awardee Name': text,
  'Sub-Recipient UEI': text,
  [DATE_FIELD]: text,
  'Sub-Award Amount': z.union([z.number(), z.string()]),
  'Prime Recipient Name': text,
  'Prime Award Recipient UEI': text,
  prime_award_generated_internal_id: text,
  PSC: z.looseObject({ code: text }).nullish(),
});
const rowsEnvelopeSchema = z.looseObject({ results: z.array(z.unknown()) });
const countEnvelopeSchema = z.looseObject({
  results: z.looseObject({ subcontracts: z.number().int().min(0) }),
});

/** A firm the source named by neither name nor UEI. */
const UNNAMED = '(unnamed)';

/**
 * The filters of a subcontract search: every award search's, over contracts
 * — a subcontract sits under a contract, never under a vehicle — with the
 * band as the amount, since here `award_amounts` is the subcontract's own.
 */
const subawardFilters = (request: SubawardScopeRequest): Record<string, unknown> =>
  awardFilters(
    { ...request, facets: { ...request.facets, amount: request.band } },
    AWARD_TYPE_CODES.contracts,
  );

export const toSubawardCountBody = (request: SubawardScopeRequest): Record<string, unknown> => ({
  filters: subawardFilters(request),
  subawards: true,
});

export const toSubawardsBody = (request: SubawardsRequest): Record<string, unknown> => ({
  filters: subawardFilters(request),
  fields: FIELDS,
  subawards: true,
  sort: DATE_FIELD,
  order: 'desc',
  limit: request.limit,
  page: request.page,
});

/** One reported subcontract, or null when it has no readable amount. Pure. */
export function normalizeSubcontract(raw: unknown): SubcontractRow | null {
  const parsed = subcontractSchema.safeParse(raw);
  if (!parsed.success) return null;
  const record = parsed.data;
  const value = amount(record['Sub-Award Amount']);
  if (value === null) return null;
  return {
    prime: {
      uei: clean(record['Prime Award Recipient UEI']),
      name: clean(record['Prime Recipient Name']) ?? UNNAMED,
    },
    subcontractor: {
      uei: clean(record['Sub-Recipient UEI']),
      name: clean(record['Sub-Awardee Name']) ?? UNNAMED,
    },
    primeAwardId: clean(record.prime_award_generated_internal_id),
    amount: value,
    date: day(record[DATE_FIELD]),
    pscCode: clean(record.PSC?.code),
  };
}

/**
 * The subcontracts primes report, in USAspending's award search with
 * `subawards: true`: one count for a scope, and its rows a numbered page at
 * a time, most recent first. A full page says another follows.
 */
export class UsaSpendingSubcontracts implements Subcontracts {
  readonly id = USASPENDING_SOURCE_ID;
  readonly disclosures = USASPENDING_DISCLOSURES.subcontracts;
  readonly unsupportedFacets = UNSUPPORTED_FACETS;

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async count(request: SubawardScopeRequest): Promise<Attempted<Fetched<number>>> {
    const { attempts, result } = await this.http.postJson(
      `${this.baseUrl}${COUNT_PATH}`,
      toSubawardCountBody(request),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = countEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    return {
      attempts,
      result: {
        kind: 'ok',
        value: parsed.data.results.subcontracts,
        recordCount: 1,
        totalRecords: null,
      },
    };
  }

  async page(request: SubawardsRequest): Promise<Attempted<Fetched<SubcontractPage>>> {
    const { attempts, result } = await this.http.postJson(
      `${this.baseUrl}${ROWS_PATH}`,
      toSubawardsBody(request),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = rowsEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const rows: SubcontractRow[] = [];
    let rejected = 0;
    for (const raw of parsed.data.results) {
      const row = normalizeSubcontract(raw);
      if (row === null) rejected += 1;
      else rows.push(row);
    }
    if (rejected > 0) this.warn(`usaspending: ${rejected} subcontract(s) did not normalize`);
    return {
      attempts,
      result: {
        kind: 'ok',
        value: { rows, rejected, hasMore: parsed.data.results.length >= request.limit },
        recordCount: parsed.data.results.length,
        totalRecords: null,
      },
    };
  }
}
