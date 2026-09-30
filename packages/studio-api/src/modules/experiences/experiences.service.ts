import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ExperienceProfile } from '@sysdesign/db';

@Injectable()
export class ExperiencesService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Seeded reference data — a handful of rows, so no pagination parameters.
   * Ordered by id: the fixture assigns sequential UUIDs, so this is fixture
   * order, which is deliberate.
   */
  async list(): Promise<[ExperienceProfile[], number]> {
    return this.em.findAndCount(ExperienceProfile, {}, { orderBy: { id: 'asc' } });
  }

  async findOne(id: string): Promise<ExperienceProfile> {
    const experience = await this.em.findOne(ExperienceProfile, id);
    if (!experience) {
      throw new NotFoundException(`Experience ${id} not found`);
    }
    return experience;
  }
}
