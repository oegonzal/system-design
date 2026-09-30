import type { Entity, SourceAvailability } from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../budget';
import type { UpsertSummary } from './repositories';

/** An entity as an adapter normalizes it; the service stamps `fetchedAt`. */
export type EntityDraft = Omit<Entity, 'fetchedAt'>;

/** One batch answered: the registrants found, and how many records did not normalize. */
export interface EntityBatch {
  entities: EntityDraft[];
  rejected: number;
}

/** SAM.gov's Entity Management API — budgeted, up to `MAX_UEI_BATCH` UEIs per request. */
export interface EntityRegistry {
  readonly id: string;
  readonly availability: SourceAvailability;
  lookup(ueis: readonly string[]): Promise<Attempted<Fetched<EntityBatch>>>;
}

export interface EntityRepository {
  upsertMany(entities: readonly Entity[]): Promise<UpsertSummary>;
  find(uei: string): Promise<Entity | null>;
  findMany(ueis: readonly string[]): Promise<Entity[]>;
}
