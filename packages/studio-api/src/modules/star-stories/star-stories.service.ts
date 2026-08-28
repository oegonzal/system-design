import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UniqueConstraintViolationException, type FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { DEFAULT_LIST_LIMIT } from '@sysdesign/contracts';
import { ExperienceProfile, Prompt, StarStory } from '@sysdesign/db';

import { contains } from '../../common/ilike';
import type { ListStarStoriesQueryDto } from './dto/list-star-stories-query.dto';
import type { SaveStarStoryRequestDto } from './dto/save-star-story.dto';

interface StoryLinks {
  prompt: Prompt | null;
  experience: ExperienceProfile | null;
}

@Injectable()
export class StarStoriesService {
  constructor(private readonly em: EntityManager) {}

  async create(dto: SaveStarStoryRequestDto): Promise<StarStory> {
    const { prompt, experience } = await this.resolveLinks(dto);

    const story = this.em.create(StarStory, {
      title: dto.title,
      situation: dto.situation,
      task: dto.task,
      action: dto.action,
      result: dto.result,
      tags: dto.tags,
      prompt,
      experience,
    });
    this.em.persist(story);
    await this.flushOrConflict(dto.title);

    return story;
  }

  async list(query: ListStarStoriesQueryDto): Promise<[StarStory[], number]> {
    return this.em.findAndCount(StarStory, this.buildWhere(query), {
      limit: query.limit ?? DEFAULT_LIST_LIMIT,
      offset: query.offset ?? 0,
      orderBy: { updatedAt: 'desc', id: 'asc' },
    });
  }

  private buildWhere(query: ListStarStoriesQueryDto): FilterQuery<StarStory> {
    return {
      ...(query.search
        ? {
            $or: [
              { title: { $ilike: contains(query.search) } },
              { situation: { $ilike: contains(query.search) } },
              { result: { $ilike: contains(query.search) } },
            ],
          }
        : {}),
      // Exact membership via Postgres array containment (`tags @> {tag}`),
      // which the GIN index on tags serves.
      ...(query.tag ? { tags: { $contains: [query.tag] } } : {}),
      ...(query.promptId ? { prompt: query.promptId } : {}),
      ...(query.experienceId ? { experience: query.experienceId } : {}),
    };
  }

  async findOne(id: string): Promise<StarStory> {
    const story = await this.em.findOne(StarStory, id);
    if (!story) {
      throw new NotFoundException(`Story ${id} not found`);
    }
    return story;
  }

  /** PUT semantics: every field replaced, links included — absent means unlink. */
  async replace(id: string, dto: SaveStarStoryRequestDto): Promise<StarStory> {
    const story = await this.findOne(id);
    const { prompt, experience } = await this.resolveLinks(dto);

    story.title = dto.title;
    story.situation = dto.situation;
    story.task = dto.task;
    story.action = dto.action;
    story.result = dto.result;
    story.tags = dto.tags;
    story.prompt = prompt;
    story.experience = experience;
    await this.flushOrConflict(dto.title);

    return story;
  }

  async remove(id: string): Promise<void> {
    const story = await this.findOne(id);
    this.em.remove(story);
    await this.em.flush();
  }

  /** 422 rather than 400: the ids are well-formed, they just point at nothing. */
  private async resolveLinks(dto: SaveStarStoryRequestDto): Promise<StoryLinks> {
    const prompt = dto.promptId ? await this.em.findOne(Prompt, dto.promptId) : null;
    if (dto.promptId && !prompt) {
      throw new UnprocessableEntityException(`Unknown promptId: ${dto.promptId}`);
    }

    const experience = dto.experienceId
      ? await this.em.findOne(ExperienceProfile, dto.experienceId)
      : null;
    if (dto.experienceId && !experience) {
      throw new UnprocessableEntityException(`Unknown experienceId: ${dto.experienceId}`);
    }

    return { prompt, experience };
  }

  /**
   * Catch the constraint rather than checking first: a check-then-insert races
   * two concurrent requests with the same title.
   */
  private async flushOrConflict(title: string): Promise<void> {
    try {
      await this.em.flush();
    } catch (err) {
      if (err instanceof UniqueConstraintViolationException) {
        throw new ConflictException(`A story titled "${title}" already exists`);
      }
      throw err;
    }
  }
}
