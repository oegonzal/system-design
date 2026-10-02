import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ExperienceProfile } from '@sysdesign/db';

import { notFound } from '../../common/not-found';
import type { ListExperiencesQueryInput } from './experience-requests';

@Injectable()
export class ExperiencesService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Seeded reference data, paged like every list so the envelope reports the
   * page it applied. Ordered by id: the fixture assigns sequential UUIDs, so
   * this is fixture order, which is deliberate.
   */
  async list(query: ListExperiencesQueryInput): Promise<[ExperienceProfile[], number]> {
    return this.em.findAndCount(
      ExperienceProfile,
      {},
      { orderBy: { id: 'asc' }, limit: query.limit, offset: query.offset },
    );
  }

  async findOne(id: string): Promise<ExperienceProfile> {
    const experience = await this.em.findOne(ExperienceProfile, id);
    if (!experience) {
      throw notFound('experience', `Experience ${id} not found`);
    }
    return experience;
  }
}
