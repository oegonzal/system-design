/**
 * Registrants as an adapter answers them, the registry scripted, and the
 * registrant store in memory.
 */
import { entityOf, type Entity } from '@sysdesign/contracts';

import type { Fetched } from '../budget';
import type {
  EntityBatch,
  EntityDraft,
  EntityRegistry,
  EntityRepository,
  UpsertSummary,
} from '../ports';
import { type Scripted, asAttempted } from './replies';

/** An entity as an adapter answers it — the wire record minus the fetch stamp the service adds. */
export const entityDraftOf = (overrides: Partial<Entity> = {}): EntityDraft =>
  Object.fromEntries(
    Object.entries(entityOf(overrides)).filter(([key]) => key !== 'fetchedAt'),
  ) as EntityDraft;

export const entityBatchOf = (entities: EntityDraft[], rejected = 0): Fetched<EntityBatch> => ({
  kind: 'ok',
  value: { entities, rejected },
  recordCount: entities.length + rejected,
  totalRecords: null,
});

/** Answers the scripted batches in order, repeating the last, and remembers every batch of UEIs asked. */
export function scriptedRegistry(
  replies: readonly Scripted<EntityBatch>[],
  enabled = true,
): EntityRegistry & { batches: string[][] } {
  const batches: string[][] = [];
  let call = 0;
  return {
    id: 'sam.gov',
    availability: { enabled, reason: enabled ? null : 'no-key' },
    batches,
    async lookup(ueis) {
      batches.push([...ueis]);
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      if (!reply) throw new Error('scriptedRegistry: no replies');
      return asAttempted(reply);
    },
  };
}

export class InMemoryEntityRepository implements EntityRepository {
  readonly rows = new Map<string, Entity>();

  async upsertMany(entities: readonly Entity[]): Promise<UpsertSummary> {
    let inserted = 0;
    let updated = 0;
    for (const entity of entities) {
      if (this.rows.has(entity.uei)) updated += 1;
      else inserted += 1;
      this.rows.set(entity.uei, entity);
    }
    return { inserted, updated };
  }

  async find(uei: string): Promise<Entity | null> {
    return this.rows.get(uei) ?? null;
  }
}
