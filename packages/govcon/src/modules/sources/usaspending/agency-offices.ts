import type {
  AgencyOfficesRequest,
  OfficeObligations,
  SubAgencyObligations,
} from '@sysdesign/contracts';
import { z } from 'zod';

import type { Attempted, Fetched } from '../../../core/budget';
import type { AgencyOffices, OfficesPage } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { USASPENDING_DISCLOSURES } from './disclosures';
import { awardTypeCodesOf } from './families';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';
import { amount, clean, integer } from './values';

const text = z.string().nullish();
const numeric = z.union([z.number(), z.string()]).nullish();
const officeSchema = z.looseObject({
  code: text,
  name: text,
  total_obligations: numeric,
  transaction_count: numeric,
  new_award_count: numeric,
});
const subAgencySchema = officeSchema.extend({
  abbreviation: text,
  children: z.array(z.unknown()).nullish(),
});
const officesEnvelopeSchema = z.looseObject({
  results: z.array(z.unknown()),
  page_metadata: z.looseObject({ hasNext: z.boolean().nullish() }).nullish(),
});

export const officesPath = (toptierCode: string): string =>
  `/api/v2/agency/${encodeURIComponent(toptierCode)}/sub_agency/`;

/** The query as USAspending spells it: the year, the award types, the sort, the page. */
export function toOfficesParams(request: AgencyOfficesRequest): URLSearchParams {
  return new URLSearchParams({
    fiscal_year: String(request.fiscalYear),
    award_type_codes: awardTypeCodesOf(request.awardFamily).join(','),
    agency_type: 'awarding',
    sort: 'total_obligations',
    order: 'desc',
    limit: String(request.limit),
    page: String(request.page),
  });
}

const officeOf = (record: z.output<typeof officeSchema>): OfficeObligations | null => {
  const name = clean(record.name);
  if (name === null) return null;
  return {
    code: clean(record.code),
    name,
    obligations: amount(record.total_obligations) ?? 0,
    transactions: integer(record.transaction_count) ?? 0,
    newAwards: integer(record.new_award_count) ?? 0,
  };
};

/** One sub-agency with its offices, or null without a name; an office without a name is dropped. */
export function normalizeSubAgency(raw: unknown): SubAgencyObligations | null {
  const parsed = subAgencySchema.safeParse(raw);
  if (!parsed.success) return null;
  const subAgency = officeOf(parsed.data);
  if (subAgency === null) return null;
  const offices: OfficeObligations[] = [];
  for (const child of parsed.data.children ?? []) {
    const office = officeSchema.safeParse(child);
    const normalized = office.success ? officeOf(office.data) : null;
    if (normalized !== null) offices.push(normalized);
  }
  return { ...subAgency, abbreviation: clean(parsed.data.abbreviation), offices };
}

/** `agency/<code>/sub_agency`: an agency's sub-agencies and offices for a year, one GET per page. */
export class UsaSpendingAgencyOffices implements AgencyOffices {
  readonly id = USASPENDING_SOURCE_ID;
  readonly disclosures = USASPENDING_DISCLOSURES.financials;

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async offices(request: AgencyOfficesRequest): Promise<Attempted<Fetched<OfficesPage>>> {
    const { attempts, result } = await this.http.json(
      `${this.baseUrl}${officesPath(request.toptierCode)}`,
      toOfficesParams(request),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = officesEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const subAgencies: SubAgencyObligations[] = [];
    let rejected = 0;
    for (const raw of parsed.data.results) {
      const subAgency = normalizeSubAgency(raw);
      if (subAgency === null) rejected += 1;
      else subAgencies.push(subAgency);
    }
    if (rejected > 0) this.warn(`usaspending: ${rejected} sub-agency row(s) did not normalize`);
    return {
      attempts,
      result: {
        kind: 'ok',
        value: { subAgencies, hasMore: parsed.data.page_metadata?.hasNext === true },
        recordCount: subAgencies.length + rejected,
        totalRecords: null,
      },
    };
  }
}
