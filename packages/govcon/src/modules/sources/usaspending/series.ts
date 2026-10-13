import type { SeriesRequest } from '@sysdesign/contracts';
import { z } from 'zod';

import type { Attempted, Fetched } from '../../../core/budget';
import type { ObligationSeries, SeriesPoint } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { USASPENDING_DISCLOSURES } from './disclosures';
import { awardTypeCodesOf } from './families';
import { awardFilters } from './filters';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';
import { amount, integer } from './values';

const SERIES_PATH = '/api/v2/search/spending_over_time/';

const numeric = z.union([z.number(), z.string()]).nullish();
const seriesPointSchema = z.looseObject({
  time_period: z.looseObject({
    fiscal_year: z.union([z.string(), z.number()]),
    month: z.union([z.string(), z.number()]).nullish(),
  }),
  aggregated_amount: numeric,
  Contract_Obligations: numeric,
  Idv_Obligations: numeric,
});
const seriesEnvelopeSchema = z.looseObject({ results: z.array(z.unknown()) });

/** The request as USAspending spells it: the group, the window and the scope filters. */
export function toSeriesBody(request: SeriesRequest): Record<string, unknown> {
  return {
    group: request.group,
    filters: awardFilters(request, awardTypeCodesOf(request.awardFamily)),
  };
}

/** One point of the series, or null when the source gave no fiscal year. `month` is the fiscal period. */
export function normalizeSeriesPoint(raw: unknown): SeriesPoint | null {
  const parsed = seriesPointSchema.safeParse(raw);
  if (!parsed.success) return null;
  const fiscalYear = integer(parsed.data.time_period.fiscal_year);
  if (fiscalYear === null) return null;
  const contracts = amount(parsed.data.Contract_Obligations) ?? 0;
  const idvs = amount(parsed.data.Idv_Obligations) ?? 0;
  return {
    fiscalYear,
    period: integer(parsed.data.time_period.month),
    contracts,
    idvs,
    total: amount(parsed.data.aggregated_amount) ?? contracts + idvs,
  };
}

/** `spending_over_time`: obligations by fiscal period or year, one POST per window. */
export class UsaSpendingSeries implements ObligationSeries {
  readonly id = USASPENDING_SOURCE_ID;
  readonly disclosures = USASPENDING_DISCLOSURES.awards;

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async series(request: SeriesRequest): Promise<Attempted<Fetched<SeriesPoint[]>>> {
    const { attempts, result } = await this.http.postJson(
      `${this.baseUrl}${SERIES_PATH}`,
      toSeriesBody(request),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = seriesEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const points: SeriesPoint[] = [];
    let rejected = 0;
    for (const raw of parsed.data.results) {
      const point = normalizeSeriesPoint(raw);
      if (point === null) rejected += 1;
      else points.push(point);
    }
    if (rejected > 0) this.warn(`usaspending: ${rejected} series point(s) did not normalize`);
    return {
      attempts,
      result: {
        kind: 'ok',
        value: points,
        recordCount: points.length + rejected,
        totalRecords: null,
      },
    };
  }
}
