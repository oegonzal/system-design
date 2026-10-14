import type { AwardFamily, HorizonRequest, HorizonRow } from '@sysdesign/contracts';
import { z } from 'zod';

import { dottedPath } from '../../../core/agency-path';
import type { Attempted, Fetched } from '../../../core/budget';
import type { EndingAwards, EndingAwardsPage } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { USASPENDING_DISCLOSURES } from './disclosures';
import { AWARD_TYPE_CODES, END_DATE_FIELD } from './families';
import { awardFilters } from './filters';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';
import { amount, clean, day } from './values';

const SEARCH_PATH = '/api/v2/search/spending_by_award/';

/** The fields every family shares; the family's end-date field joins them, and is what the page is sorted by. */
const BASE_FIELDS = [
  'Award ID',
  'Recipient Name',
  'Recipient UEI',
  'Award Amount',
  'Awarding Agency',
  'Awarding Agency Code',
  'Awarding Sub Agency',
  'Awarding Sub Agency Code',
  'Contract Award Type',
  'NAICS',
  'PSC',
  'Description',
  'generated_internal_id',
];

const text = z.string().nullish();
const codeDescription = z.looseObject({ code: text, description: text }).nullish();
const endingAwardSchema = z.looseObject({
  generated_internal_id: z.string().min(1),
  'Award ID': text,
  'Recipient Name': text,
  'Recipient UEI': text,
  'Award Amount': z.union([z.number(), z.string()]).nullish(),
  'Awarding Agency': text,
  'Awarding Agency Code': text,
  'Awarding Sub Agency': text,
  'Awarding Sub Agency Code': text,
  'Contract Award Type': text,
  NAICS: codeDescription,
  PSC: codeDescription,
  Description: text,
  'End Date': text,
  'Last Date to Order': text,
});
const endingEnvelopeSchema = z.looseObject({ results: z.array(z.unknown()) });

/**
 * The request as USAspending spells it: sorted by the family's end date,
 * newest first, by page number. Measured 2026-10-13: a request carrying the
 * source's keyset cursor (`last_record_unique_id`, `last_record_sort_value`)
 * answers an empty-body 503 every time, while numbered pages answer down to
 * the source's 50,000th award — so the cursor is never sent.
 */
export function toEndingBody(request: HorizonRequest): Record<string, unknown> {
  const endField = END_DATE_FIELD[request.family];
  return {
    filters: awardFilters(request, AWARD_TYPE_CODES[request.family]),
    fields: [...BASE_FIELDS, endField],
    sort: endField,
    order: 'desc',
    limit: request.limit,
    page: request.page,
  };
}

export type NormalizedEnding = { ok: true; row: HorizonRow } | { ok: false; reason: string };

/** An award of a family → `HorizonRow`. Pure. It needs its id and a readable end date. */
export function normalizeEndingAward(raw: unknown, family: AwardFamily): NormalizedEnding {
  const parsed = endingAwardSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, reason: parsed.error.issues[0]?.message ?? 'unreadable' };
  const record = parsed.data;
  const endsAt = day(family === 'idvs' ? record['Last Date to Order'] : record['End Date']);
  if (endsAt === null)
    return { ok: false, reason: `${END_DATE_FIELD[family]}: missing or unreadable` };
  return {
    ok: true,
    row: {
      externalId: record.generated_internal_id,
      piid: clean(record['Award ID']),
      family,
      typeDescription: clean(record['Contract Award Type']),
      recipientName: clean(record['Recipient Name']),
      recipientUei: clean(record['Recipient UEI']),
      amount: amount(record['Award Amount']) ?? 0,
      endsAt,
      agencyPath: dottedPath([
        clean(record['Awarding Agency']),
        clean(record['Awarding Sub Agency']),
      ]),
      agencyCode: dottedPath([
        clean(record['Awarding Agency Code']),
        clean(record['Awarding Sub Agency Code']),
      ]),
      naicsCode: clean(record.NAICS?.code),
      pscCode: clean(record.PSC?.code),
      description: clean(record.Description),
    },
  };
}

/**
 * `spending_by_award` sorted by end date: one numbered page of one family,
 * and whether another follows — a full page says so. The source's own
 * `hasNext` does not: measured 2026-10-13, it is false from page 100 on while
 * page 101 still answers a full page.
 */
export class UsaSpendingEndingAwards implements EndingAwards {
  readonly id = USASPENDING_SOURCE_ID;
  readonly disclosures = [
    ...USASPENDING_DISCLOSURES.awards,
    ...USASPENDING_DISCLOSURES.horizon,
    ...USASPENDING_DISCLOSURES.endDates,
  ];

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async page(request: HorizonRequest): Promise<Attempted<Fetched<EndingAwardsPage>>> {
    const { attempts, result } = await this.http.postJson(
      `${this.baseUrl}${SEARCH_PATH}`,
      toEndingBody(request),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = endingEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const rows: HorizonRow[] = [];
    let rejected = 0;
    for (const raw of parsed.data.results) {
      const normalized = normalizeEndingAward(raw, request.family);
      if (normalized.ok) rows.push(normalized.row);
      else rejected += 1;
    }
    if (rejected > 0) this.warn(`usaspending: ${rejected} ending award(s) did not normalize`);
    return {
      attempts,
      result: {
        kind: 'ok',
        value: { rows, rejected, hasMore: parsed.data.results.length >= request.limit },
        recordCount: rows.length + rejected,
        totalRecords: null,
      },
    };
  }
}
