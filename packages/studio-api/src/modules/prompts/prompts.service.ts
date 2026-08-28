import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { DEFAULT_LIST_LIMIT, type PromptDifficulty, type PromptStatus } from '@sysdesign/contracts';
import { ExperienceProfile, Prompt } from '@sysdesign/db';

import type { ListPromptsQueryDto } from './dto/list-prompts-query.dto';
import { generatePrompt, GENERATOR_VERSION } from './generator/prompt-generator';
import { fnv1a } from './generator/rng';

@Injectable()
export class PromptsService {
  constructor(private readonly em: EntityManager) {}

  /** 422 rather than 404: the request body is well-formed, just unsatisfiable. */
  async generate(
    experienceId: string,
    difficulty: PromptDifficulty = 'standard',
    seed?: number,
  ): Promise<Prompt> {
    const experience = await this.em.findOne(ExperienceProfile, experienceId);
    if (!experience) {
      throw new UnprocessableEntityException(`Unknown experienceId: ${experienceId}`);
    }

    return this.createPrompt(experience, difficulty, seed ?? (await this.nextSeed(experience)));
  }

  /** Same experience and difficulty, next derived seed → a fresh variant. */
  async regenerate(id: string): Promise<Prompt> {
    const existing = await this.em.findOne(Prompt, id, { populate: ['experience'] });
    if (!existing) {
      throw new NotFoundException(`Prompt ${id} not found`);
    }

    const experience = existing.experience;
    return this.createPrompt(experience, existing.difficulty, await this.nextSeed(experience));
  }

  /**
   * Derived, not random: hash of slug + how many prompts the experience
   * already has. Deterministic for a fresh database, yet every generation
   * bumps the count and therefore the next seed — regenerate always moves.
   * Masked to 31 bits because `seed` is an int4 column.
   */
  private async nextSeed(experience: ExperienceProfile): Promise<number> {
    const count = await this.em.count(Prompt, { experience });
    return fnv1a(`${experience.slug}:${count}`) & 0x7fffffff;
  }

  private async createPrompt(
    experience: ExperienceProfile,
    difficulty: PromptDifficulty,
    seed: number,
  ): Promise<Prompt> {
    const generated = generatePrompt({ experience, difficulty, seed });

    const prompt = this.em.create(Prompt, {
      experience,
      // Denormalized so list filtering by archetype needs no join.
      archetype: experience.archetype,
      title: generated.title,
      scenario: generated.scenario,
      functionalRequirements: generated.functionalRequirements,
      nonFunctionalRequirements: generated.nonFunctionalRequirements,
      scaleTargets: generated.scaleTargets,
      difficulty,
      seed,
      generatorVersion: GENERATOR_VERSION,
    });
    this.em.persist(prompt);
    await this.em.flush();

    return prompt;
  }

  async list(query: ListPromptsQueryDto): Promise<[Prompt[], number]> {
    return this.em.findAndCount(Prompt, this.buildWhere(query), {
      limit: query.limit ?? DEFAULT_LIST_LIMIT,
      offset: query.offset ?? 0,
      // id breaks createdAt ties (rows created in the same millisecond), so
      // pagination never shows a row twice or skips one.
      orderBy: { createdAt: 'desc', id: 'asc' },
    });
  }

  /**
   * One object literal rather than mutation: FilterQuery is a union type and
   * assigning to its properties does not typecheck.
   */
  private buildWhere(query: ListPromptsQueryDto): FilterQuery<Prompt> {
    return {
      ...(query.experienceId ? { experience: query.experienceId } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
  }

  async findOne(id: string): Promise<Prompt> {
    const prompt = await this.em.findOne(Prompt, id);
    if (!prompt) {
      throw new NotFoundException(`Prompt ${id} not found`);
    }
    return prompt;
  }

  async updateStatus(id: string, status: PromptStatus): Promise<Prompt> {
    const prompt = await this.findOne(id);
    prompt.status = status;
    await this.em.flush();
    return prompt;
  }
}
