import type { SourceAvailability } from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../../../core/budget';
import type { NoticeDescriptions } from '../../../core/ports';
import { htmlToText } from './description-text';
import { issuesOf, SAM_GOV_SOURCE_ID, type SamGovHttp } from './http';
import { samDescriptionSchema } from './schemas';

/** A notice's description is a second, separately priced request. */
export const SAM_GOV_DESCRIPTION_URL = 'https://api.sam.gov/prod/opportunities/v1/noticedesc';

export class SamGovDescriptions implements NoticeDescriptions {
  readonly id = SAM_GOV_SOURCE_ID;
  readonly availability: SourceAvailability = { enabled: true, reason: null };

  constructor(
    private readonly http: SamGovHttp,
    private readonly url = SAM_GOV_DESCRIPTION_URL,
  ) {}

  async get(noticeId: string): Promise<Attempted<Fetched<string>>> {
    const { attempts, result } = await this.http.json(
      this.url,
      new URLSearchParams({ noticeid: noticeId }),
    );
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = samDescriptionSchema.safeParse(result.body);
    if (!parsed.success) {
      return {
        attempts,
        result: this.http.invalid(`description: ${issuesOf(parsed.error.issues)}`),
      };
    }
    return {
      attempts,
      result: {
        kind: 'ok',
        value: htmlToText(parsed.data.description),
        recordCount: 1,
        totalRecords: null,
      },
    };
  }
}
