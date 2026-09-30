import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  CANVAS_PIPELINE_ID,
  designPromptDraftSchema,
  PROMPT_PIPELINE_ID,
  renderDesignPromptMarkdown,
  type AuthorPromptRequest,
  type ImportPromptRequest,
  type PromptGenerationDto,
  type PromptLibraryDocumentDto,
  type PromptLibraryEntryDto,
  type QualityRunDto,
  type QualityRunStartedDto,
  type SuccessCriterion,
  type UpdatePromptRequest,
} from '@sysdesign/contracts';
import { DesignSession, ExperienceProfile, Prompt, PromptGeneration } from '@sysdesign/db';

import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import { renderExperienceGoal } from './experience-goal';
import type { ListPromptsQueryInput } from './prompt-requests';
import { toPromptDto } from './prompts.mapper';

/** The prompt pipeline writes, is criticised, and rewrites once. */
const GENERATION_ITERATIONS = 2;

/** Thrown inside the claim transaction when another poll claimed first; rolls the transaction back. */
class AlreadyClaimed extends Error {}

/**
 * Prompts are markdown documents with a rubric the quality loop derived. The
 * three ways one comes to exist — written, imported from the loop's library,
 * or drafted from an experience by the loop's `design-prompt` pipeline — all
 * end in the same row, and the rubric is derived the same way for each: once,
 * through `POST /criteria`, and kept for the prompt's life.
 */
@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
  ) {}

  listLibrary(): Promise<PromptLibraryEntryDto[]> {
    return this.loop.listPrompts();
  }

  async libraryDocument(id: string): Promise<PromptLibraryDocumentDto> {
    const document = await this.loop.getPrompt(id);
    if (!document) throw new NotFoundException(`library prompt ${id} not found`);
    return document;
  }

  /** The rubric is derived before the row exists: a grader that cannot answer leaves nothing behind. */
  async author(request: AuthorPromptRequest): Promise<Prompt> {
    const experience = request.experienceId ? await this.experience(request.experienceId) : null;
    const criteria = await this.rubricFor(request.markdown);
    const prompt = this.em.create(Prompt, {
      title: request.title,
      markdown: request.markdown,
      criteria,
      source: 'authored',
      experience,
    });
    this.em.persist(prompt);
    await this.em.flush();
    return prompt;
  }

  async import(request: ImportPromptRequest): Promise<Prompt> {
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
      experience: null,
    });
    this.em.persist(prompt);
    await this.em.flush();
    return prompt;
  }

  /**
   * Start a draft from an experience — the named one, or the least practised
   * so repeated practice covers every experience. The run is the loop's; the
   * row here remembers which experience it was drawn from and, once claimed,
   * which prompt it became.
   */
  async startGeneration(experienceId: string | undefined): Promise<QualityRunStartedDto> {
    const experience = experienceId
      ? await this.experience(experienceId)
      : await this.leastPractised();
    const started = await this.loop.startRun({
      pipeline: PROMPT_PIPELINE_ID,
      goal: renderExperienceGoal(experience),
      maxIterations: GENERATION_ITERATIONS,
    });
    this.em.persist(this.em.create(PromptGeneration, { runId: started.runId, experience }));
    await this.em.flush();
    return started;
  }

  /**
   * The run's state, and — the first time it is read complete — the best
   * draft claimed into a prompt. Claiming is a conditional update, so two
   * concurrent polls create one prompt and both answer with it.
   */
  async generation(runId: string): Promise<PromptGenerationDto> {
    const row = await this.em.findOne(
      PromptGeneration,
      { runId },
      { populate: ['prompt', 'experience'] },
    );
    if (!row) throw new NotFoundException(`prompt generation ${runId} not found`);

    const run = await this.loop.getRun(runId);
    const answer = (
      partial: Pick<PromptGenerationDto, 'status' | 'error'> & Partial<PromptGenerationDto>,
    ): PromptGenerationDto => ({
      runId,
      decision: null,
      overall: null,
      prompt: null,
      ...partial,
    });

    if (row.prompt) {
      const best = run?.trace ? bestIteration(run) : null;
      return answer({
        status: 'complete',
        error: null,
        decision: best?.decision.finalDecision ?? null,
        overall: best?.decision.scores.overall ?? null,
        prompt: toPromptDto(await this.ensureCriteria(row.prompt)),
      });
    }
    if (run === null) {
      return answer({ status: 'failed', error: 'the quality loop has no record of this run' });
    }
    if (run.status === 'running') return answer({ status: 'running', error: null });
    if (run.status === 'failed' || run.trace === null) {
      return answer({ status: 'failed', error: run.error?.message ?? 'the run failed' });
    }

    const best = bestIteration(run);
    const draft = designPromptDraftSchema.safeParse(best.artifact);
    if (!draft.success) {
      return answer({ status: 'failed', error: 'the run produced no prompt draft' });
    }
    const claimed = await this.claim(runId, row.experience, draft.data);
    return answer({
      status: 'complete',
      error: null,
      decision: best.decision.finalDecision,
      overall: best.decision.scores.overall,
      prompt: toPromptDto(claimed),
    });
  }

  async list(query: ListPromptsQueryInput): Promise<[Prompt[], number]> {
    return this.em.findAndCount(
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
  }

  /** A read derives the rubric when it is still empty — the one moment a prompt's criteria are minted. */
  async findOne(id: string): Promise<Prompt> {
    return this.ensureCriteria(await this.require(id));
  }

  /** Re-derive the rubric. Refused once sessions cite its ids. */
  async rederiveCriteria(id: string): Promise<Prompt> {
    const prompt = await this.require(id);
    await this.assertNoSessions(prompt, 're-derive its criteria');
    prompt.criteria = [];
    return this.ensureCriteria(prompt);
  }

  /**
   * Archive or reactivate freely; retitle or rewrite only while no session
   * has been graded against it — a rewritten prompt is a different prompt,
   * and its criteria are derived again.
   */
  async update(id: string, request: UpdatePromptRequest): Promise<Prompt> {
    const prompt = await this.require(id);
    if (request.status !== undefined) prompt.status = request.status;
    if (request.title !== undefined || request.markdown !== undefined) {
      await this.assertNoSessions(prompt, 'be rewritten');
      if (request.title !== undefined) prompt.title = request.title;
      if (request.markdown !== undefined && request.markdown !== prompt.markdown) {
        prompt.markdown = request.markdown;
        prompt.criteria = [];
      }
    }
    await this.em.flush();
    return this.ensureCriteria(prompt);
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

  /** The canvas pipeline's rubric for a prompt — the one derivation every source shares. */
  private async rubricFor(markdown: string): Promise<SuccessCriterion[]> {
    const derived = await this.loop.deriveCriteria({
      pipeline: CANVAS_PIPELINE_ID,
      goal: markdown,
    });
    return derived.criteria;
  }

  private async require(id: string): Promise<Prompt> {
    const prompt = await this.em.findOne(Prompt, id);
    if (!prompt) throw new NotFoundException(`Prompt ${id} not found`);
    return prompt;
  }

  /** 422 rather than 400: the id is well-formed, it just points at nothing. */
  private async experience(id: string): Promise<ExperienceProfile> {
    const experience = await this.em.findOne(ExperienceProfile, id);
    if (!experience) throw new UnprocessableEntityException(`Unknown experienceId: ${id}`);
    return experience;
  }

  /** Fewest prompts wins; fixture order breaks ties, so a fresh database rotates predictably. */
  private async leastPractised(): Promise<ExperienceProfile> {
    const experiences = await this.em.find(ExperienceProfile, {}, { orderBy: { id: 'asc' } });
    if (experiences.length === 0) {
      throw new UnprocessableEntityException('no experiences are seeded to draw a prompt from');
    }
    const counts = await Promise.all(
      experiences.map((experience) => this.em.count(Prompt, { experience: experience.id })),
    );
    let least = 0;
    counts.forEach((count, index) => {
      if (count < counts[least]) least = index;
    });
    return experiences[least];
  }

  private async assertNoSessions(prompt: Prompt, verb: string): Promise<void> {
    if ((await this.em.count(DesignSession, { prompt: prompt.id })) > 0) {
      throw new ConflictException(
        `prompt ${prompt.id} has sessions graded against its criteria and cannot ${verb}`,
      );
    }
  }

  private async claim(
    runId: string,
    experience: ExperienceProfile | null,
    draft: ReturnType<typeof designPromptDraftSchema.parse>,
  ): Promise<Prompt> {
    const markdown = renderDesignPromptMarkdown(draft);
    const criteria = await this.rubricFor(markdown);
    let id: string;
    try {
      id = await this.em.transactional(async (em) => {
        const prompt = em.create(Prompt, {
          title: draft.title,
          markdown,
          criteria,
          source: 'generated',
          experience,
        });
        em.persist(prompt);
        await em.flush();
        const claimed = await em.nativeUpdate(
          PromptGeneration,
          { runId, prompt: null },
          { prompt: prompt.id },
        );
        if (claimed === 0) throw new AlreadyClaimed();
        return prompt.id;
      });
    } catch (error) {
      if (!(error instanceof AlreadyClaimed)) throw error;
      const row = await this.em.findOneOrFail(
        PromptGeneration,
        { runId },
        { populate: ['prompt'], refresh: true },
      );
      if (!row.prompt) throw new ConflictException(`prompt generation ${runId} is being claimed`);
      this.logger.log(`prompt generation ${runId} was claimed by a concurrent poll`);
      return row.prompt;
    }
    return this.em.findOneOrFail(Prompt, id);
  }
}

/** The iteration the loop crowned. */
const bestIteration = (run: QualityRunDto) => {
  const trace = run.trace;
  if (!trace) throw new Error(`run ${run.runId} has no trace`);
  return trace.iterations[trace.bestIteration - 1] ?? trace.iterations[trace.iterations.length - 1];
};
