import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { SearchProfile, StoredProfile } from '@sysdesign/contracts';

import type { ProfileRecord, ProfileRepository, SavedSearchRepository } from '../../core/ports';
import { parseProfile, validateProfile } from '../../core/profile';
import { ENFAV, ENFAV_SEARCHES } from '../../profiles';
import { CLOCK } from '../sources/tokens';
import { PROFILE_REPOSITORY, SAVED_SEARCH_REPOSITORY } from './tokens';

const toStored = (record: ProfileRecord): StoredProfile => ({
  ...record.profile,
  isDefault: record.isDefault,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

/**
 * Profiles as data in the store. Every write goes through the boot schema
 * (a bad document is a 400 with its issues and nothing is written), exactly
 * one profile is the default while any exists, and the shipped Enfav profile
 * seeds an empty store once — with its eight searches flagged for the pull —
 * and is edited in the store from then on.
 */
@Injectable()
export class ProfilesService implements OnModuleInit {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository,
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly searches: SavedSearchRepository,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed();
  }

  /** The shipped profile, once, into an empty store; validated first so a bad seed fails the boot. */
  async seed(): Promise<boolean> {
    if ((await this.profiles.count()) > 0) return false;
    const profile = validateProfile(ENFAV);
    const at = this.now();
    if ((await this.profiles.insert(profile, true, at)) === null) return false;
    for (const [index, search] of ENFAV_SEARCHES.entries()) {
      await this.searches.insert(
        profile.id,
        { ...search, days: 3, includedInPull: true, pullOrder: index },
        at,
      );
    }
    this.logger.log(`seeded profile ${profile.id} with ${ENFAV_SEARCHES.length} saved searches`);
    return true;
  }

  async list(): Promise<StoredProfile[]> {
    return (await this.profiles.list()).map(toStored);
  }

  async get(id: string): Promise<StoredProfile> {
    return toStored(await this.record(id));
  }

  /** The named profile, or the default when none is named — as validated data. */
  async resolve(id: string | undefined): Promise<SearchProfile> {
    const record =
      id === undefined ? await this.profiles.findDefault() : await this.profiles.find(id);
    if (!record) {
      throw new NotFoundException(
        id === undefined ? 'no default profile' : `unknown profile ${id}`,
      );
    }
    // A stored document predating a schema change fails here, loudly, not in the scorer.
    return validateProfile(record.profile);
  }

  async create(candidate: unknown): Promise<StoredProfile> {
    const profile = this.validated(candidate);
    const isDefault = (await this.profiles.count()) === 0;
    const record = await this.profiles.insert(profile, isDefault, this.now());
    if (!record) throw new ConflictException(`profile ${profile.id} already exists`);
    return toStored(record);
  }

  async update(id: string, candidate: unknown): Promise<StoredProfile> {
    const profile = this.validated(candidate);
    if (profile.id !== id) {
      throw new BadRequestException({
        message: 'validation failed',
        issues: [{ path: 'id', message: `must be ${id}` }],
      });
    }
    const record = await this.profiles.update(profile, this.now());
    if (!record) throw new NotFoundException(`unknown profile ${id}`);
    return toStored(record);
  }

  /** The last profile cannot go; removing the default hands the flag to the first remaining. */
  async remove(id: string): Promise<void> {
    const record = await this.record(id);
    if ((await this.profiles.count()) <= 1) {
      throw new ConflictException('the last profile cannot be removed');
    }
    await this.profiles.remove(id);
    if (record.isDefault) {
      const next = (await this.profiles.list())[0];
      if (next) await this.profiles.setDefault(next.profile.id);
    }
  }

  async setDefault(id: string): Promise<StoredProfile> {
    if (!(await this.profiles.setDefault(id))) throw new NotFoundException(`unknown profile ${id}`);
    return this.get(id);
  }

  private async record(id: string): Promise<ProfileRecord> {
    const record = await this.profiles.find(id);
    if (!record) throw new NotFoundException(`unknown profile ${id}`);
    return record;
  }

  private validated(candidate: unknown): SearchProfile {
    const parsed = parseProfile(candidate);
    if (!parsed.ok) {
      throw new BadRequestException({ message: 'validation failed', issues: parsed.issues });
    }
    return parsed.profile;
  }
}
