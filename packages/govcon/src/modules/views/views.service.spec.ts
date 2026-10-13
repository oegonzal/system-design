import { NotFoundException } from '@nestjs/common';

import {
  InMemoryProfileRepository,
  InMemorySavedSearchRepository,
  InMemorySavedViewRepository,
  tinyProfile,
} from '../../core/testing';
import { ProfilesService } from '../profiles/profiles.service';
import { ViewsService } from './views.service';

const T1 = new Date('2026-09-26T12:00:00Z');
const T2 = new Date('2026-09-27T12:00:00Z');

async function harness() {
  let now = T1;
  const clock = () => now;
  const profiles = new ProfilesService(
    new InMemoryProfileRepository(),
    new InMemorySavedSearchRepository(),
    clock,
  );
  await profiles.create(tinyProfile());
  return {
    service: new ViewsService(new InMemorySavedViewRepository(), profiles, clock),
    later: () => {
      now = T2;
    },
  };
}

describe('the views service', () => {
  it('[GOV-28] keeps a view under its name, replaces the address of a name already kept without making a second, lists by name, and removes by id', async () => {
    const { service, later } = await harness();
    const where = await service.save('tiny', { name: 'Who buys', href: '/spending?tab=where' });
    expect(where).toMatchObject({
      profileId: 'tiny',
      name: 'Who buys',
      href: '/spending?tab=where',
      createdAt: T1.toISOString(),
      updatedAt: T1.toISOString(),
    });
    await service.save('tiny', { name: 'Ending soon', href: '/spending?tab=horizon&months=6' });
    later();
    const moved = await service.save('tiny', {
      name: 'Who buys',
      href: '/spending?tab=where&category=recipient',
    });
    expect(moved).toMatchObject({
      id: where.id,
      href: '/spending?tab=where&category=recipient',
      createdAt: T1.toISOString(),
      updatedAt: T2.toISOString(),
    });
    expect((await service.list('tiny')).map((view) => view.name)).toEqual([
      'Ending soon',
      'Who buys',
    ]);

    await service.remove(where.id);
    expect((await service.list('tiny')).map((view) => view.name)).toEqual(['Ending soon']);
  });

  it('[GOV-28] answers an unknown profile or view as not found, writing nothing', async () => {
    const { service } = await harness();
    await expect(service.list('nobody')).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.save('nobody', { name: 'Who buys', href: '/spending' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('v-404')).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.list('tiny')).toEqual([]);
  });
});
