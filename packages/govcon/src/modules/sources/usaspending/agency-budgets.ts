import type { AgencyBudgetRequest, AgencyYear } from '@sysdesign/contracts';
import { z } from 'zod';

import type { Attempted, Fetched } from '../../../core/budget';
import type { AgencyBudgets } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { USASPENDING_DISCLOSURES } from './disclosures';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';
import { amount, integer } from './values';

const numeric = z.union([z.number(), z.string()]).nullish();
const agencyYearSchema = z.looseObject({
  fiscal_year: z.union([z.number(), z.string()]),
  agency_budgetary_resources: numeric,
  agency_total_obligated: numeric,
  agency_total_outlayed: numeric,
  agency_obligation_by_period: z
    .array(z.looseObject({ period: z.union([z.number(), z.string()]), obligated: numeric }))
    .nullish(),
});
const budgetEnvelopeSchema = z.looseObject({ agency_data_by_year: z.array(z.unknown()) });

export const budgetPath = (toptierCode: string): string =>
  `/api/v2/agency/${encodeURIComponent(toptierCode)}/budgetary_resources/`;

/** One year as the source reported it, or null without a fiscal year. The periods come as given; the core aligns them. */
export function normalizeAgencyYear(raw: unknown): AgencyYear | null {
  const parsed = agencyYearSchema.safeParse(raw);
  if (!parsed.success) return null;
  const fiscalYear = integer(parsed.data.fiscal_year);
  if (fiscalYear === null) return null;
  const byPeriod: AgencyYear['byPeriod'] = [];
  for (const point of parsed.data.agency_obligation_by_period ?? []) {
    const period = integer(point.period);
    const obligated = amount(point.obligated);
    if (period !== null && obligated !== null) byPeriod.push({ period, obligated });
  }
  return {
    fiscalYear,
    budgetaryResources: amount(parsed.data.agency_budgetary_resources),
    obligated: amount(parsed.data.agency_total_obligated),
    outlayed: amount(parsed.data.agency_total_outlayed),
    byPeriod,
  };
}

/** `agency/<code>/budgetary_resources`: every fiscal year the source has for one agency. */
export class UsaSpendingAgencyBudgets implements AgencyBudgets {
  readonly id = USASPENDING_SOURCE_ID;
  readonly disclosures = USASPENDING_DISCLOSURES.financials;

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async budgets(request: AgencyBudgetRequest): Promise<Attempted<Fetched<AgencyYear[]>>> {
    const { attempts, result } = await this.http.json(
      `${this.baseUrl}${budgetPath(request.toptierCode)}`,
      new URLSearchParams(),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = budgetEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const years: AgencyYear[] = [];
    let rejected = 0;
    for (const raw of parsed.data.agency_data_by_year) {
      const year = normalizeAgencyYear(raw);
      if (year === null) rejected += 1;
      else years.push(year);
    }
    if (rejected > 0) this.warn(`usaspending: ${rejected} agency year(s) did not normalize`);
    return {
      attempts,
      result: {
        kind: 'ok',
        value: years,
        recordCount: years.length + rejected,
        totalRecords: null,
      },
    };
  }
}
