import type { BreakdownCategory, BreakdownRequest } from '@sysdesign/contracts';
import { z } from 'zod';

import type { Attempted, Fetched } from '../../../core/budget';
import type { CategoryPage, CategoryRow, SpendingBreakdowns } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { USASPENDING_DISCLOSURES } from './disclosures';
import { awardTypeCodesOf } from './families';
import { awardFilters } from './filters';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';
import { amount, clean } from './values';

/** A row the source named by neither name nor code. */
const UNNAMED = '(unnamed)';

const text = z.string().nullish();
const categoryRowSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).nullish(),
  code: text,
  uei: text,
  name: text,
  amount: z.union([z.number(), z.string()]).nullish(),
});
const categoryEnvelopeSchema = z.looseObject({
  results: z.array(z.unknown()),
  page_metadata: z.looseObject({ hasNext: z.boolean().nullish() }).nullish(),
});

/** The category endpoint, by the closed vocabulary — never request prose. */
export const breakdownPath = (category: BreakdownCategory): string =>
  `/api/v2/search/spending_by_category/${category}/`;

export function toBreakdownBody(request: BreakdownRequest): Record<string, unknown> {
  return {
    filters: awardFilters(request, awardTypeCodesOf(request.awardFamily)),
    limit: request.limit,
    page: request.page,
  };
}

/**
 * One ranked row. Its code is the one a reader can act on: a firm's UEI
 * where the source gives one — a recipient row's own `code` is the retired
 * DUNS number — and the source's code otherwise: an abbreviation, a NAICS,
 * a state.
 */
export function normalizeCategoryRow(raw: unknown): CategoryRow | null {
  const parsed = categoryRowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const code = clean(parsed.data.uei) ?? clean(parsed.data.code);
  return {
    id: parsed.data.id === null || parsed.data.id === undefined ? null : String(parsed.data.id),
    code,
    name: clean(parsed.data.name) ?? code ?? UNNAMED,
    amount: amount(parsed.data.amount) ?? 0,
  };
}

/** `spending_by_category/<category>`: the scope's obligations ranked, one POST per page. */
export class UsaSpendingBreakdowns implements SpendingBreakdowns {
  readonly id = USASPENDING_SOURCE_ID;
  readonly disclosures = USASPENDING_DISCLOSURES.awards;

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async breakdown(request: BreakdownRequest): Promise<Attempted<Fetched<CategoryPage>>> {
    const { attempts, result } = await this.http.postJson(
      `${this.baseUrl}${breakdownPath(request.category)}`,
      toBreakdownBody(request),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = categoryEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const rows: CategoryRow[] = [];
    let rejected = 0;
    for (const raw of parsed.data.results) {
      const row = normalizeCategoryRow(raw);
      if (row === null) rejected += 1;
      else rows.push(row);
    }
    if (rejected > 0) this.warn(`usaspending: ${rejected} category row(s) did not normalize`);
    return {
      attempts,
      result: {
        kind: 'ok',
        value: { rows, hasMore: parsed.data.page_metadata?.hasNext === true },
        recordCount: rows.length + rejected,
        totalRecords: null,
      },
    };
  }
}
