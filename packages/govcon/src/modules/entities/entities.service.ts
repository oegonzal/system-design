import {
  BadGatewayException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MAX_UEI_BATCH, type Entity, type EntityLookup } from '@sysdesign/contracts';

import { bucketOf, type BudgetPolicy, type RequestGate } from '../../core/budget';
import type { EntityRegistry, EntityRepository } from '../../core/ports';
import { ProfilesService } from '../profiles/profiles.service';
import { BUDGET_POLICY, CLOCK, ENTITY_REGISTRY, REQUEST_GATE } from '../sources/tokens';
import { ENTITY_REPOSITORY } from './tokens';

/**
 * Registrants: a lookup spends one gated request per batch of up to
 * `MAX_UEI_BATCH` UEIs and stores what came back; a read answers from the
 * store; the profile's own company is its `entityUei` looked up the same way.
 */
@Injectable()
export class EntitiesService {
  constructor(
    @Inject(ENTITY_REPOSITORY) private readonly entities: EntityRepository,
    @Inject(ENTITY_REGISTRY) private readonly registry: EntityRegistry,
    @Inject(BUDGET_POLICY) private readonly budget: BudgetPolicy,
    @Inject(REQUEST_GATE) private readonly gate: RequestGate,
    private readonly profiles: ProfilesService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  /** From the store only — never a request. */
  get(uei: string): Promise<Entity | null> {
    return this.entities.find(uei);
  }

  /** The profile's own registration, from the store; null until looked up or without a UEI on the profile. */
  async own(profileId: string | undefined): Promise<Entity | null> {
    const profile = await this.profiles.resolve(profileId);
    return profile.entityUei === null ? null : this.entities.find(profile.entityUei);
  }

  /** One gated request per batch; a spent budget is a 503, a failed upstream a 502, so nothing half-answers. */
  async lookup(ueis: readonly string[]): Promise<EntityLookup> {
    const unique = [...new Set(ueis)];
    const found: Entity[] = [];
    for (let start = 0; start < unique.length; start += MAX_UEI_BATCH) {
      const batch = unique.slice(start, start + MAX_UEI_BATCH);
      const result = await this.gate.spend(
        { source: this.registry.id, operation: 'entity', query: { ueis: batch }, cacheable: false },
        () => this.registry.lookup(batch),
      );
      if (result.kind === 'budget-exhausted') {
        throw new ServiceUnavailableException(`budget ${result.spent}/${result.budget} spent`);
      }
      if (result.kind === 'error') {
        throw new BadGatewayException(`${result.outcome}: ${result.message}`);
      }
      if (result.kind === 'cached') continue;
      const fetchedAt = this.now().toISOString();
      const entities = result.value.entities.map((entity) => ({ ...entity, fetchedAt }));
      await this.entities.upsertMany(entities);
      found.push(...entities);
    }
    const known = new Set(found.map((entity) => entity.uei));
    return {
      entities: found,
      unknown: unique.filter((uei) => !known.has(uei)),
      spent: await this.gate.spent(this.registry.id),
      budget: bucketOf(this.budget, this.registry.id)?.dailyBudget ?? 0,
    };
  }
}
