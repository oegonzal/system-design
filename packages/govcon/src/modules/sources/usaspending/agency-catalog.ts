import type { AgencyDirectoryEntry } from '@sysdesign/contracts';
import { z } from 'zod';

import type { Attempted, Fetched } from '../../../core/budget';
import type { AgencyCatalog } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { USASPENDING_DISCLOSURES } from './disclosures';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';
import { amount, clean, integer } from './values';

const CATALOG_PATH = '/api/v2/references/toptier_agencies/';

const text = z.string().nullish();
const numeric = z.union([z.number(), z.string()]).nullish();
const agencySchema = z.looseObject({
  agency_id: z.union([z.number(), z.string()]),
  toptier_code: z.string().min(1),
  abbreviation: text,
  agency_name: z.string().min(1),
  budget_authority_amount: numeric,
  obligated_amount: numeric,
  outlay_amount: numeric,
  active_fy: numeric,
  active_fq: numeric,
});
const catalogEnvelopeSchema = z.looseObject({ results: z.array(z.unknown()) });

export function normalizeAgency(raw: unknown): AgencyDirectoryEntry | null {
  const parsed = agencySchema.safeParse(raw);
  if (!parsed.success) return null;
  const agencyId = integer(parsed.data.agency_id);
  if (agencyId === null) return null;
  return {
    agencyId,
    toptierCode: parsed.data.toptier_code,
    abbreviation: clean(parsed.data.abbreviation) ?? '',
    name: parsed.data.agency_name,
    budgetAuthority: amount(parsed.data.budget_authority_amount) ?? 0,
    obligated: amount(parsed.data.obligated_amount) ?? 0,
    outlayed: amount(parsed.data.outlay_amount) ?? 0,
    activeFiscalYear: integer(parsed.data.active_fy),
    activeQuarter: integer(parsed.data.active_fq),
  };
}

/** `references/toptier_agencies`: every toptier agency with its budget authority — one GET. */
export class UsaSpendingAgencyCatalog implements AgencyCatalog {
  readonly id = USASPENDING_SOURCE_ID;
  readonly disclosures = USASPENDING_DISCLOSURES.financials;

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async agencies(): Promise<Attempted<Fetched<AgencyDirectoryEntry[]>>> {
    const { attempts, result } = await this.http.json(
      `${this.baseUrl}${CATALOG_PATH}`,
      new URLSearchParams(),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = catalogEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const entries: AgencyDirectoryEntry[] = [];
    let rejected = 0;
    for (const raw of parsed.data.results) {
      const entry = normalizeAgency(raw);
      if (entry === null) rejected += 1;
      else entries.push(entry);
    }
    if (rejected > 0) this.warn(`usaspending: ${rejected} agency row(s) did not normalize`);
    return {
      attempts,
      result: {
        kind: 'ok',
        value: entries,
        recordCount: entries.length + rejected,
        totalRecords: entries.length + rejected,
      },
    };
  }
}
