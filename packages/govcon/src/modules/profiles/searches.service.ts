import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SavedSearch } from '@sysdesign/contracts';

import type { SavedSearchInput, SavedSearchRecord, SavedSearchRepository } from '../../core/ports';
import { ProfilesService } from './profiles.service';
import { CLOCK } from '../sources/tokens';
import { SAVED_SEARCH_REPOSITORY } from './tokens';

export const toSavedSearch = (record: SavedSearchRecord): SavedSearch => ({
  id: record.id,
  profileId: record.profileId,
  name: record.name,
  filter: record.filter,
  days: record.days,
  includedInPull: record.includedInPull,
  pullOrder: record.pullOrder,
  lastRunAt: record.lastRunAt === null ? null : record.lastRunAt.toISOString(),
  lastYield: record.lastYield,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

/** A profile's saved searches: named filters, some of them the daily pull's slices. */
@Injectable()
export class SearchesService {
  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly searches: SavedSearchRepository,
    private readonly profiles: ProfilesService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  async list(profileId: string): Promise<SavedSearch[]> {
    await this.profiles.get(profileId);
    return (await this.searches.listByProfile(profileId)).map(toSavedSearch);
  }

  async get(id: string): Promise<SavedSearchRecord> {
    const record = await this.searches.find(id);
    if (!record) throw new NotFoundException(`unknown saved search ${id}`);
    return record;
  }

  async create(profileId: string, input: SavedSearchInput): Promise<SavedSearch> {
    await this.profiles.get(profileId);
    const record = await this.searches.insert(profileId, input, this.now());
    if (!record)
      throw new ConflictException(`profile ${profileId} already has a search named ${input.name}`);
    return toSavedSearch(record);
  }

  async update(id: string, input: SavedSearchInput): Promise<SavedSearch> {
    const record = await this.searches.update(id, input, this.now());
    if (record === null) throw new NotFoundException(`unknown saved search ${id}`);
    if (record === 'conflict')
      throw new ConflictException(`a search named ${input.name} already exists`);
    return toSavedSearch(record);
  }

  async remove(id: string): Promise<void> {
    if (!(await this.searches.remove(id)))
      throw new NotFoundException(`unknown saved search ${id}`);
  }
}
