import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { ENFAV_SEARCHES } from '../../profiles';
import {
  InMemoryProfileRepository,
  InMemorySavedSearchRepository,
  tinyProfile,
} from '../../core/testing';
import { ProfilesService } from './profiles.service';
import { SearchesService } from './searches.service';

const NOW = new Date('2026-09-26T12:00:00Z');

function harness() {
  const profiles = new InMemoryProfileRepository();
  const searches = new InMemorySavedSearchRepository();
  const service = new ProfilesService(profiles, searches, () => NOW);
  return {
    profiles,
    searches,
    service,
    searchesService: new SearchesService(searches, service, () => NOW),
  };
}

describe('the profiles service', () => {
  it('[GOV-13] seeds the shipped profile with its searches into an empty store once, and never again', async () => {
    const { profiles, searches, service } = harness();
    expect(await service.seed()).toBe(true);
    expect(await profiles.count()).toBe(1);
    const stored = await service.get('enfav');
    expect(stored).toMatchObject({ id: 'enfav', company: 'Enfav LLC', isDefault: true });
    const seeded = await searches.listByProfile('enfav');
    expect(seeded.map((s) => [s.name, s.filter, s.includedInPull, s.pullOrder])).toEqual(
      ENFAV_SEARCHES.map((s, index) => [s.name, s.filter, true, index]),
    );
    expect(await service.seed()).toBe(false);
    expect(await profiles.count()).toBe(1);
  });

  it('[GOV-13] refuses a document the boot schema refuses, with its issues, and writes nothing', async () => {
    const { profiles, service } = harness();
    const bad = {
      ...tinyProfile(),
      scoring: {
        ...tinyProfile().scoring,
        weights: { ...tinyProfile().scoring.weights, naics: 0.5 },
      },
    };
    await expect(service.create(bad)).rejects.toBeInstanceOf(BadRequestException);
    try {
      await service.create(bad);
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        issues: { path: string; message: string }[];
      };
      expect(response.issues).toEqual([
        { path: 'scoring.weights', message: expect.stringMatching(/sum to/) },
      ]);
    }
    expect(await profiles.count()).toBe(0);
    await expect(service.update('tiny', { ...tinyProfile(), id: 'other' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('[GOV-13] keeps one default: the first profile is it, the flag moves on request and on removal, the last cannot go', async () => {
    const { service } = harness();
    const first = await service.create(tinyProfile());
    expect(first.isDefault).toBe(true);
    const second = await service.create(tinyProfile({ id: 'second', company: 'Second' }));
    expect(second.isDefault).toBe(false);
    await expect(service.create(tinyProfile())).rejects.toBeInstanceOf(ConflictException);

    expect((await service.resolve(undefined)).id).toBe('tiny');
    expect((await service.setDefault('second')).isDefault).toBe(true);
    expect((await service.list()).map((p) => [p.id, p.isDefault])).toEqual([
      ['second', true],
      ['tiny', false],
    ]);
    await expect(service.setDefault('nope')).rejects.toBeInstanceOf(NotFoundException);

    const updated = await service.update('tiny', tinyProfile({ company: 'Renamed' }));
    expect(updated).toMatchObject({
      company: 'Renamed',
      isDefault: false,
      updatedAt: NOW.toISOString(),
    });
    await expect(service.update('nope', tinyProfile({ id: 'nope' }))).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await service.remove('second');
    expect((await service.resolve(undefined)).id).toBe('tiny');
    await expect(service.remove('tiny')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolve('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('[GOV-13] names an empty store when no profile is default', async () => {
    const { service } = harness();
    await expect(service.resolve(undefined)).rejects.toThrow(/no default profile/);
  });
});

describe('the searches service', () => {
  it("[GOV-13] [GOV-14] keeps a profile's searches by unique name, validated, in pull order", async () => {
    const { service, searchesService } = harness();
    await service.create(tinyProfile());
    const input = {
      name: 'Machine shops',
      filter: { naics: '332710' as const },
      days: 3,
      includedInPull: true,
      pullOrder: 1,
    };
    const created = await searchesService.create('tiny', input);
    expect(created).toMatchObject({
      profileId: 'tiny',
      ...input,
      lastRunAt: null,
      createdAt: NOW.toISOString(),
    });
    await expect(searchesService.create('tiny', input)).rejects.toBeInstanceOf(ConflictException);
    await expect(searchesService.create('nope', input)).rejects.toBeInstanceOf(NotFoundException);

    const other = await searchesService.create('tiny', {
      ...input,
      name: 'Software',
      filter: { naics: '541511' },
      pullOrder: 0,
    });
    expect((await searchesService.list('tiny')).map((s) => s.name)).toEqual([
      'Software',
      'Machine shops',
    ]);

    await expect(
      searchesService.update(other.id, { ...input, pullOrder: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
    const moved = await searchesService.update(other.id, {
      ...input,
      name: 'Software',
      includedInPull: false,
    });
    expect(moved.includedInPull).toBe(false);
    await expect(searchesService.update('nope', input)).rejects.toBeInstanceOf(NotFoundException);

    await searchesService.remove(other.id);
    expect((await searchesService.list('tiny')).map((s) => s.name)).toEqual(['Machine shops']);
    await expect(searchesService.remove(other.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
