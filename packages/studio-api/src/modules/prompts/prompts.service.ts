import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  CANVAS_PIPELINE_ID,
  DEFAULT_PRACTICE_FORMAT,
  practiceFormatForLibraryFolder,
  PROMPT_COPY,
  withStandingCriteria,
  type AuthorPromptRequest,
  type ImportPromptRequest,
  type PromptLibraryDocumentDto,
  type PromptLibraryEntryDto,
  type SuccessCriterion,
  type UpdatePromptRequest,
} from '@sysdesign/contracts';
import { DesignSession, ExperienceProfile, Prompt } from '@sysdesign/db';

import { notFound } from '../../common/not-found';
import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import type { ListPromptsQueryInput } from './prompt-requests';
import type { PromptView } from './prompts.mapper';

/**
 * Prompts are markdown documents with a rubric. The three ways one comes to
 * exist — written, imported from the loop's library, or drafted from an
 * experience by the loop's `design-prompt` pipeline (`PromptGenerationService`,
 * next door) — all end in the same row. A written or imported prompt's rubric is derived once from its
 * markdown through the loop's `POST /criteria`; a generated prompt's rubric
 * is its draft's own rows, one criterion each, since the draft was judged
 * row by row and the markdown was rendered from it. Either way the rubric is
 * kept for the prompt's life: a rewrite is a different prompt, derived again
 * and authored from then on. Once a session cites the criteria the prompt is
 * locked — every read says so, and re-deriving or rewriting it is refused.
 */
@Injectable()
export class PromptsService {
  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
  ) {}

  listLibrary(): Promise<PromptLibraryEntryDto[]> {
    return this.loop.listPrompts();
  }

  async libraryDocument(id: string): Promise<PromptLibraryDocumentDto> {
    const document = await this.loop.getPrompt(id);
    if (!document) throw notFound('library-prompt', `library prompt ${id} not found`);
    return document;
  }

  /** The rubric is derived before the row exists: a grader that cannot answer leaves nothing behind. */
  async author(request: AuthorPromptRequest): Promise<PromptView> {
    const experience = request.experienceId ? await this.experience(request.experienceId) : null;
    const criteria = await this.rubricFor(request.markdown);
    const prompt = this.em.create(Prompt, {
      title: request.title,
      markdown: request.markdown,
      criteria,
      source: 'authored',
      format: request.format ?? DEFAULT_PRACTICE_FORMAT,
      experience,
    });
    this.em.persist(prompt);
    await this.em.flush();
    return this.view(prompt);
  }

  async import(request: ImportPromptRequest): Promise<PromptView> {
    const document = await this.loop.getPrompt(request.libraryId);
    if (!document) {
      throw new UnprocessableEntityException(`Unknown library prompt: ${request.libraryId}`);
    }
    const criteria = await this.rubricFor(document.markdown);
    const prompt = this.em.create(Prompt, {
      title: document.title,
      markdown: document.markdown,
      criteria,
      source: 'library',
      format: request.format ?? practiceFormatForLibraryFolder(document.folder),
      experience: null,
    });
    this.em.persist(prompt);
    await this.em.flush();
    return this.view(prompt);
  }

  async list(query: ListPromptsQueryInput): Promise<[PromptView[], number]> {
    const [prompts, total] = await this.em.findAndCount(
      Prompt,
      {
        ...(query.experienceId ? { experience: query.experienceId } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      {
        limit: query.limit,
        offset: query.offset,
        orderBy: { createdAt: 'desc', id: 'asc' },
      },
    );
    return [await this.views(prompts), total];
  }

  /** A read derives the rubric when it is still empty — the one moment a prompt's criteria are minted. */
  async findOne(id: string): Promise<PromptView> {
    return this.view(await this.ensureCriteria(await this.require(id)));
  }

  /**
   * Re-derive the rubric. Refused once sessions cite its ids, and for a
   * generated prompt, whose rubric is its draft's rows rather than a
   * derivation — rewriting it is the way to a different rubric.
   */
  async rederiveCriteria(id: string): Promise<PromptView> {
    const prompt = await this.require(id);
    if (prompt.source === 'generated') {
      throw new ConflictException(PROMPT_COPY.generatedCriteria);
    }
    await this.assertUnlocked(prompt, PROMPT_COPY.criteriaLocked);
    prompt.criteria = [];
    return this.view(await this.ensureCriteria(prompt));
  }

  /**
   * Archive or reactivate freely; retitle or rewrite only while no session
   * has been started on it — a rewritten prompt is a different prompt:
   * its criteria are derived again, and whatever it was generated or
   * imported from no longer describes it, so it is authored from then on.
   */
  async update(id: string, request: UpdatePromptRequest): Promise<PromptView> {
    const prompt = await this.require(id);
    if (request.status !== undefined) prompt.status = request.status;
    if (request.title !== undefined || request.markdown !== undefined) {
      await this.assertUnlocked(prompt, PROMPT_COPY.textLocked);
      if (request.title !== undefined) prompt.title = request.title;
      if (request.markdown !== undefined && request.markdown !== prompt.markdown) {
        // Derived before anything is written: a grader that cannot derive
        // leaves the prompt exactly as it was, never rewritten without a rubric.
        const criteria = await this.rubricFor(request.markdown);
        prompt.markdown = request.markdown;
        prompt.criteria = criteria;
        prompt.source = 'authored';
      }
    }
    await this.em.flush();
    return this.view(await this.ensureCriteria(prompt));
  }

  /**
   * The rubric, derived once. Nothing here invents one: without a model the
   * loop answers 503 and that is the answer the client gets, so the prompt
   * stays without criteria until a model is back.
   */
  async ensureCriteria(prompt: Prompt): Promise<Prompt> {
    if (prompt.criteria.length > 0) return prompt;
    prompt.criteria = await this.rubricFor(prompt.markdown);
    await this.em.flush();
    return prompt;
  }

  /**
   * The canvas pipeline's rubric for a prompt — the one derivation every
   * source shares, closed by the standing criteria every canvas rubric
   * carries (the loop uses a supplied rubric verbatim, so they are appended
   * here and never derived).
   */
  private async rubricFor(markdown: string): Promise<SuccessCriterion[]> {
    const derived = await this.loop.deriveCriteria({
      pipeline: CANVAS_PIPELINE_ID,
      goal: markdown,
    });
    return withStandingCriteria(derived.criteria);
  }

  private async require(id: string): Promise<Prompt> {
    const prompt = await this.em.findOne(Prompt, id);
    if (!prompt) throw notFound('prompt', `Prompt ${id} not found`);
    return prompt;
  }

  /** 422 rather than 400: the id is well-formed, it just points at nothing. */
  async experience(id: string): Promise<ExperienceProfile> {
    const experience = await this.em.findOne(ExperienceProfile, id);
    if (!experience) throw new UnprocessableEntityException(`Unknown experienceId: ${id}`);
    return experience;
  }

  /**
   * Each prompt with whether practice has locked it: a session started on it
   * cites its criteria by id. One grouped count for the lot — the rule
   * `assertUnlocked` refuses with, so a read and a refusal never disagree.
   */
  private async views(prompts: readonly Prompt[]): Promise<PromptView[]> {
    const sessions =
      prompts.length === 0
        ? {}
        : await this.em.countBy(DesignSession, 'prompt', {
            where: { prompt: { $in: prompts.map((prompt) => prompt.id) } },
          });
    return prompts.map((prompt) => ({ prompt, rubricLocked: (sessions[prompt.id] ?? 0) > 0 }));
  }

  async view(prompt: Prompt): Promise<PromptView> {
    const [view] = await this.views([prompt]);
    return view;
  }

  private async assertUnlocked(prompt: Prompt, refusal: string): Promise<void> {
    if ((await this.view(prompt)).rubricLocked) throw new ConflictException(refusal);
  }
}
