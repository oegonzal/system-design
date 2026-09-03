import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  AUTHORED_GENERATOR_VERSION,
  DEFAULT_LIST_LIMIT,
  validateWorkflowSpec,
  type PromptDifficulty,
  type PromptStatus,
} from '@sysdesign/contracts';
import { ExperienceProfile, Prompt } from '@sysdesign/db';
import { asRecordable, type LlmClient } from '@sysdesign/llm';
import { GIT_CONTEXT, makeRunId, writeDump } from '@sysdesign/run-dump';

import { randomInt } from 'node:crypto';

import { LLM_CLIENT } from '../llm/llm.token';
import { buildPromptDump, startPromptDump, type PromptDump, type PromptDumpLlm } from './dump';
import type { AuthorPromptRequestDto } from './dto/author-prompt.dto';
import type { ListPromptsQueryDto } from './dto/list-prompts-query.dto';
import { enrichPrompt } from './generator/enrich-prompt';
import { generatePrompt, GENERATOR_VERSION } from './generator/prompt-generator';

/** How many recent prompts a new one must not echo, and how hard to try. */
const RECENT_FRAMINGS = 3;
const MAX_SEED_DRAWS = 12;

@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(
    private readonly em: EntityManager,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  /**
   * 422 rather than 404: the request body is well-formed, just unsatisfiable.
   * No `experienceId` means "surprise me" — practice rotates to the
   * least-practiced experience, so coverage spreads across every archetype
   * instead of re-drilling one.
   */
  /**
   * A prompt from an assessment's own requirements — "bring your own
   * take-home". Nothing is drawn or enriched: the requirement set is stored
   * verbatim, the archetype rubric applies as it applies to those
   * requirements, and `generatorVersion` records the provenance. Shape was
   * the DTO's job; this pass collects every REFERENTIAL problem into one 422 —
   * a spec that does not close, an ingest naming an NFR this prompt does not
   * carry, a repeated NFR id — the way submit does for a revision.
   */
  async author(dto: AuthorPromptRequestDto): Promise<Prompt> {
    const experience = await this.em.findOne(ExperienceProfile, dto.experienceId);
    if (!experience) {
      throw new UnprocessableEntityException(`Unknown experienceId: ${dto.experienceId}`);
    }

    const nfrIds = new Set<string>();
    const problems: string[] = [];
    for (const nfr of dto.nonFunctionalRequirements) {
      if (nfrIds.has(nfr.id)) problems.push(`duplicate NFR id: ${nfr.id}`);
      nfrIds.add(nfr.id);
    }
    if (dto.workflowSpec !== null) {
      problems.push(...validateWorkflowSpec(dto.workflowSpec));
      for (const ingest of dto.workflowSpec.ingests) {
        if (!nfrIds.has(ingest.nfrId)) {
          problems.push(
            `ingest '${ingest.id}' names an NFR this prompt does not carry: ${ingest.nfrId}`,
          );
        }
      }
    }
    if (problems.length > 0) {
      throw new UnprocessableEntityException(problems);
    }

    const prompt = this.em.create(Prompt, {
      experience,
      archetype: experience.archetype,
      title: dto.title,
      scenario: dto.scenario,
      functionalRequirements: dto.functionalRequirements,
      functionalCapabilities: dto.functionalCapabilities,
      nonFunctionalRequirements: dto.nonFunctionalRequirements,
      scaleTargets: dto.scaleTargets,
      workflowSpec: dto.workflowSpec,
      difficulty: dto.difficulty,
      // Provenance, not reproducibility: there was no draw to replay.
      seed: 0,
      generatorVersion: AUTHORED_GENERATOR_VERSION,
      llmEnriched: false,
    });
    this.em.persist(prompt);
    await this.em.flush();
    return prompt;
  }

  async generate(
    experienceId: string | undefined,
    difficulty: PromptDifficulty = 'standard',
    seed?: number,
  ): Promise<Prompt> {
    const experience = experienceId
      ? await this.em.findOne(ExperienceProfile, experienceId)
      : await this.leastPracticedExperience();
    if (!experience) {
      throw new UnprocessableEntityException(`Unknown experienceId: ${experienceId}`);
    }

    return this.createPrompt(
      experience,
      difficulty,
      seed ?? (await this.noveltySeed(experience, difficulty)),
    );
  }

  /** Same experience and difficulty, a fresh non-repeating seed → a fresh variant. */
  async regenerate(id: string): Promise<Prompt> {
    const existing = await this.em.findOne(Prompt, id, { populate: ['experience'] });
    if (!existing) {
      throw new NotFoundException(`Prompt ${id} not found`);
    }

    const experience = existing.experience;
    return this.createPrompt(
      experience,
      existing.difficulty,
      await this.noveltySeed(experience, existing.difficulty),
    );
  }

  /**
   * A random seed, drawn again while its framing echoes a recent prompt.
   *
   * Random rather than derived-from-row-count (the old scheme): the count
   * resets whenever a database starts fresh, which made "the first prompt"
   * identical every time. Reproducibility is untouched — the chosen seed is
   * stored on the row, and `generatePrompt` stays a pure function of it
   * ([GEN-2]); only the *selection* is non-deterministic. The prompt table is
   * the seen-list: a candidate whose title matches one of the last few for
   * this experience is redrawn (titles are generator-owned and never
   * LLM-enriched, so the comparison is stable). If every draw collides —
   * the variant pool is finite — the first draw stands.
   */
  private async noveltySeed(
    experience: ExperienceProfile,
    difficulty: PromptDifficulty,
  ): Promise<number> {
    const recent = await this.em.find(
      Prompt,
      { experience },
      { orderBy: { createdAt: 'desc', id: 'desc' }, limit: RECENT_FRAMINGS },
    );
    const seen = new Set(recent.map((prompt) => prompt.title));

    let first: number | null = null;
    for (let draw = 0; draw < MAX_SEED_DRAWS; draw++) {
      const seed = randomInt(0, 0x80000000); // int4 column: 31 bits
      first ??= seed;
      const candidate = generatePrompt({ experience, difficulty, seed });
      if (!seen.has(candidate.title)) return seed;
    }
    return first as number;
  }

  /**
   * The rotation behind "surprise me": the experience with the fewest prompts,
   * ties broken by the longest-untouched, then by fixture order — one grouped
   * count, no per-experience queries.
   */
  private async leastPracticedExperience(): Promise<ExperienceProfile> {
    const experiences = await this.em.find(ExperienceProfile, {}, { orderBy: { id: 'asc' } });
    if (experiences.length === 0) {
      throw new UnprocessableEntityException('no experiences seeded — run pnpm db:seed first');
    }

    const rows = await this.em
      .getConnection()
      .execute<{ id: string; n: string; latest: Date }[]>(
        'select "experience_id" as id, count(*) as n, max("created_at") as latest from "prompt" group by "experience_id"',
      );
    const byId = new Map(rows.map((row) => [row.id, row]));

    return [...experiences].sort((a, b) => {
      const [ra, rb] = [byId.get(a.id), byId.get(b.id)];
      const countDiff = Number(ra?.n ?? 0) - Number(rb?.n ?? 0);
      if (countDiff !== 0) return countDiff;
      const latestDiff = new Date(ra?.latest ?? 0).getTime() - new Date(rb?.latest ?? 0).getTime();
      if (latestDiff !== 0) return latestDiff;
      return a.id.localeCompare(b.id);
    })[0];
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
        // able to switch an eval rule on or off — nor add or reshape the
        // workflow spec the product dimension grades.
        functionalCapabilities: generated.functionalCapabilities,
        nonFunctionalRequirements: generated.nonFunctionalRequirements,
        scaleTargets: generated.scaleTargets,
        workflowSpec: generated.workflowSpec,
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
