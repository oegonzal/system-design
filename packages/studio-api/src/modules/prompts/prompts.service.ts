import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { DEFAULT_LIST_LIMIT, type PromptDifficulty, type PromptStatus } from '@sysdesign/contracts';
import { ExperienceProfile, Prompt } from '@sysdesign/db';
import { asRecordable, type LlmClient } from '@sysdesign/llm';
import { GIT_CONTEXT, makeRunId, writeDump } from '@sysdesign/run-dump';

import { buildPromptDump, startPromptDump, type PromptDump, type PromptDumpLlm } from './dump';
import type { ListPromptsQueryDto } from './dto/list-prompts-query.dto';
import { enrichPrompt } from './generator/enrich-prompt';
import { generatePrompt, GENERATOR_VERSION } from './generator/prompt-generator';
import { fnv1a } from './generator/rng';

/** Injection token for the LlmClient interface (interfaces erase at runtime). */
export const LLM_CLIENT = Symbol('LLM_CLIENT');

@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(
    private readonly em: EntityManager,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

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
    const dump = startPromptDump({
      runId: makeRunId(Date.now(), 'prompt'),
      now: Date.now(),
      llm: this.llmStatus(),
      git: GIT_CONTEXT,
    });
    dump.request({
      experienceId: experience.id,
      experienceSlug: experience.slug,
      difficulty,
      seed,
    });

    try {
      const generated = generatePrompt({ experience, difficulty, seed });
      dump.generated(generated);

      // Prose polish only — scale targets and NFRs stay byte-deterministic.
      const llm = asRecordable(this.llm)?.withRecorder(dump.record) ?? this.llm;
      const enriched = await enrichPrompt(llm, generated, experience);
      dump.enriched(enriched);

      const prompt = this.em.create(Prompt, {
        experience,
        // Denormalized so list filtering by archetype needs no join.
        archetype: experience.archetype,
        title: generated.title,
        scenario: enriched.scenario,
        functionalRequirements: enriched.functionalRequirements,
        // From the generator, never from enriched prose: LLM polish must not be
        // able to switch an eval rule on or off.
        functionalCapabilities: generated.functionalCapabilities,
        nonFunctionalRequirements: generated.nonFunctionalRequirements,
        scaleTargets: generated.scaleTargets,
        difficulty,
        seed,
        generatorVersion: GENERATOR_VERSION,
        llmEnriched: enriched.llmEnriched,
      });
      this.em.persist(prompt);
      await this.em.flush();

      // After the flush, so the dump carries the id an evaluation will join on.
      dump.persisted({
        promptId: prompt.id,
        llmEnriched: prompt.llmEnriched,
        generatorVersion: prompt.generatorVersion,
      });
      return prompt;
    } catch (error) {
      dump.failed(error);
      throw error;
    } finally {
      this.writeDump(dump);
    }
  }

  /**
   * Deliberately swallowing: this runs in a `finally`, so a throw here would
   * replace whatever error generation was already reporting. An audit trail
   * must never cost a request.
   */
  private writeDump(dump: PromptDump): void {
    try {
      writeDump(buildPromptDump(dump.state, Date.now()));
    } catch (error) {
      this.logger.warn(
        `prompt run dump ${dump.state.runId} not written: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /** Derived facts only — the API key is never recorded, in any form. */
  private llmStatus(): PromptDumpLlm {
    const deterministic = process.env['EVAL_DETERMINISTIC'] === '1';
    return {
      enabled: this.llm.enabled,
      model: this.llm.model,
      reason: this.llm.enabled ? null : deterministic ? 'deterministic' : 'no-key',
    };
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
