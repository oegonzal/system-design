import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SavedView } from '@sysdesign/contracts';

import type { SavedViewInput, SavedViewRecord, SavedViewRepository } from '../../core/ports';
import { ProfilesService } from '../profiles/profiles.service';
import { CLOCK } from '../sources/tokens';
import { SAVED_VIEW_REPOSITORY } from './tokens';

const toSavedView = (record: SavedViewRecord): SavedView => ({
  id: record.id,
  profileId: record.profileId,
  name: record.name,
  href: record.href,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

/** The views a profile keeps: named addresses inside the client. Nothing here reads what an address shows. */
@Injectable()
export class ViewsService {
  constructor(
    @Inject(SAVED_VIEW_REPOSITORY) private readonly views: SavedViewRepository,
    private readonly profiles: ProfilesService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  async list(profileId: string): Promise<SavedView[]> {
    await this.profiles.get(profileId);
    return (await this.views.listByProfile(profileId)).map(toSavedView);
  }

  /** Saved under its name: a name the profile already keeps takes the new address. */
  async save(profileId: string, input: SavedViewInput): Promise<SavedView> {
    await this.profiles.get(profileId);
    return toSavedView(await this.views.save(profileId, input, this.now()));
  }

  async remove(id: string): Promise<void> {
    if (!(await this.views.remove(id))) throw new NotFoundException(`unknown saved view ${id}`);
  }
}
