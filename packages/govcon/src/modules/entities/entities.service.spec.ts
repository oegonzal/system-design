import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { MAX_UEI_BATCH } from '@sysdesign/contracts';

import { RequestGate, type BudgetPolicy } from '../../core/budget';
import type { EntityBatch } from '../../core/ports';
import {
  entityBatchOf,
  entityDraftOf,
  failure,
  InMemoryEntityRepository,
  InMemoryProfileRepository,
  InMemorySavedSearchRepository,
  InMemorySourceCallLog,
  scriptedRegistry,
  tinyProfile,
  type Scripted,
} from '../../core/testing';
import { ProfilesService } from '../profiles/profiles.service';
import { EntitiesService } from './entities.service';

const NOW = new Date('2026-09-26T12:00:00Z');

async function harness(
  replies: readonly Scripted<EntityBatch>[],
  dailyBudget = 10,
  entityUei: string | null = 'ABC123DEF456',
) {
  const registry = scriptedRegistry(replies);
  const log = new InMemorySourceCallLog();
  const entities = new InMemoryEntityRepository();
  const profiles = new InMemoryProfileRepository();
  await profiles.insert(tinyProfile({ entityUei }), true, NOW);
  const policy: BudgetPolicy = {
    ttlMs: 0,
    pullDeadlineMs: 1,
    buckets: { 'sam.gov': { dailyBudget } },
  };
  const service = new EntitiesService(
    entities,
    registry,
    policy,
    new RequestGate(log, policy, () => NOW),
    new ProfilesService(profiles, new InMemorySavedSearchRepository(), () => NOW),
    () => NOW,
  );
  return { service, registry, log, entities };
}

describe('the entities service', () => {
  it('[GOV-18] looks up a batch through the gate, stores what came back stamped, and names the UEIs the registry did not know', async () => {
    const { service, registry, log, entities } = await harness([
      entityBatchOf([entityDraftOf(), entityDraftOf({ uei: 'ZZZ000000001', legalName: 'Other' })]),
    ]);
    const lookup = await service.lookup([
      'ABC123DEF456',
      'ZZZ000000001',
      'MISSING00001',
      'ABC123DEF456',
    ]);
    expect(registry.batches).toEqual([['ABC123DEF456', 'ZZZ000000001', 'MISSING00001']]);
    expect(lookup.entities.map((e) => [e.uei, e.fetchedAt])).toEqual([
      ['ABC123DEF456', NOW.toISOString()],
      ['ZZZ000000001', NOW.toISOString()],
    ]);
    expect(lookup.unknown).toEqual(['MISSING00001']);
    expect(lookup).toMatchObject({ spent: 1, budget: 10 });
    expect(log.calls.map((call) => [call.source, call.operation])).toEqual([['sam.gov', 'entity']]);
    expect(entities.rows.size).toBe(2);
    expect(await service.get('ZZZ000000001')).toMatchObject({ legalName: 'Other' });
    expect(await service.get('MISSING00001')).toBeNull();
  });

  it("[GOV-18] splits more than a batch into several gated requests, and answers the profile's own registration from the store", async () => {
    const { service, registry } = await harness([entityBatchOf([entityDraftOf()])]);
    const ueis = Array.from(
      { length: MAX_UEI_BATCH + 1 },
      (_, i) => `UEI${String(i).padStart(9, '0')}`,
    );
    await service.lookup(ueis);
    expect(registry.batches.map((batch) => batch.length)).toEqual([MAX_UEI_BATCH, 1]);
    expect((await service.own(undefined))?.uei).toBe('ABC123DEF456');
    const bare = await harness([], 10, null);
    expect(await bare.service.own('tiny')).toBeNull();
    const unlooked = await harness([], 10);
    expect(await unlooked.service.own('tiny')).toBeNull();
  });

  it('[GOV-18] refuses whole rather than half: a spent budget is a 503 and a failed upstream a 502', async () => {
    const spent = await harness([entityBatchOf([entityDraftOf()])], 0);
    await expect(spent.service.lookup(['ABC123DEF456'])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const down = await harness([failure('error', 502, 'status 502')]);
    await expect(down.service.lookup(['ABC123DEF456'])).rejects.toBeInstanceOf(BadGatewayException);
    expect(down.entities.rows.size).toBe(0);
  });
});
