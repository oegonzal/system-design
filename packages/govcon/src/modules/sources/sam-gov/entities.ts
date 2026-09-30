import type { SourceAvailability } from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../../../core/budget';
import type { EntityBatch, EntityRegistry } from '../../../core/ports';
import { samEntitiesEnvelopeSchema } from './entity-schemas';
import { issuesOf, SAM_GOV_SOURCE_ID, type SamGovHttp } from './http';
import { normalizeSamEntity } from './normalize-entity';

/** Entity Management: one GET per batch of UEIs; the three sections a bidder reads. */
export const SAM_GOV_ENTITIES_URL = 'https://api.sam.gov/entity-information/v3/entities';
const SECTIONS = ['entityRegistration', 'coreData', 'assertions'];

export class SamGovEntities implements EntityRegistry {
  readonly id = SAM_GOV_SOURCE_ID;
  readonly availability: SourceAvailability = { enabled: true, reason: null };

  constructor(
    private readonly http: SamGovHttp,
    private readonly url = SAM_GOV_ENTITIES_URL,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async lookup(ueis: readonly string[]): Promise<Attempted<Fetched<EntityBatch>>> {
    const params = new URLSearchParams({
      ueiSAM: ueis.join('~'),
      includeSections: SECTIONS.join(','),
    });
    const { attempts, result } = await this.http.json(this.url, params);
    if (result.kind !== 'ok') return { attempts, result };
    const parsed = samEntitiesEnvelopeSchema.safeParse(result.body);
    if (!parsed.success) {
      return { attempts, result: this.http.invalid(`envelope: ${issuesOf(parsed.error.issues)}`) };
    }
    const entities: EntityBatch['entities'] = [];
    let rejected = 0;
    for (const raw of parsed.data.entityData ?? []) {
      const normalized = normalizeSamEntity(raw);
      if (normalized.ok) entities.push(normalized.entity);
      else rejected += 1;
    }
    if (rejected > 0) this.warn(`sam.gov entities: ${rejected} record(s) did not normalize`);
    return {
      attempts,
      result: {
        kind: 'ok',
        value: { entities, rejected },
        recordCount: entities.length + rejected,
        totalRecords: null,
      },
    };
  }
}
