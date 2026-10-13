import { z } from 'zod';

import type { Attempted, Fetched } from '../../../core/budget';
import type { DataFreshness } from '../../../core/ports';
import { issuesOf, type AttemptedHttp } from '../http';
import { USASPENDING_PUBLICATION_LAGS } from './disclosures';
import { USASPENDING_BASE_URL, USASPENDING_SOURCE_ID } from './source';
import { usDay } from './values';

const FRESHNESS_PATH = '/api/v2/awards/last_updated/';
const freshnessSchema = z.looseObject({ last_updated: z.string() });

/** `awards/last_updated`: the day the source's award data was last loaded, `MM/DD/YYYY` there, ISO here. */
export class UsaSpendingFreshness implements DataFreshness {
  readonly id = USASPENDING_SOURCE_ID;
  readonly disclosures: readonly string[] = [];
  readonly publicationLags = USASPENDING_PUBLICATION_LAGS;

  constructor(
    private readonly http: AttemptedHttp,
    private readonly baseUrl = USASPENDING_BASE_URL,
  ) {}

  async lastUpdated(): Promise<Attempted<Fetched<string>>> {
    const { attempts, result } = await this.http.json(
      `${this.baseUrl}${FRESHNESS_PATH}`,
      new URLSearchParams(),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = freshnessSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const lastUpdated = usDay(parsed.data.last_updated);
    if (lastUpdated === null) {
      return { attempts, result: this.http.invalid(`last_updated: ${parsed.data.last_updated}`) };
    }
    return {
      attempts,
      result: { kind: 'ok', value: lastUpdated, recordCount: 1, totalRecords: null },
    };
  }
}
