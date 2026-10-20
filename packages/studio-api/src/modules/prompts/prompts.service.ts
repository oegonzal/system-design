import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  CANVAS_PIPELINE_ID,
  criteriaFromDraft,
  describeIssue,
  describeOverrun,
  designPromptDraftSchema,
  modelSchema,
  parseLenient,
  PROMPT_COPY,
  PROMPT_PIPELINE_ID,
  renderDesignPromptMarkdown,
  type AuthorPromptRequest,
  type DesignPromptDraft,
  type ImportPromptRequest,
  type PromptGenerationDto,
  type PromptLibraryDocumentDto,
  type PromptLibraryEntryDto,
  type QualityRunDto,
  type QualityRunStartedDto,
  type SuccessCriterion,
  type UpdatePromptRequest,
  withStandingCriteria,
} from '@sysdesign/contracts';
import { DesignSession, ExperienceProfile, Prompt, PromptGeneration } from '@sysdesign/db';

import { notFound } from '../../common/not-found';
import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import { renderExperienceGoal } from './experience-goal';
import type { ListPromptsQueryInput } from './prompt-requests';
import { toPromptDto, type PromptView } from './prompts.mapper';

/** The prompt pipeline writes, is criticised, and rewrites once. */
const GENERATION_ITERATIONS = 2;

/** The draft's declared bounds, indexed once: what a claim measures the run's fields against. */
const DRAFT_BOUNDS = modelSchema(designPromptDraftSchema).bounds;

/** Thrown inside the claim transaction when another poll claimed first; rolls the transaction back. */
class AlreadyClaimed extends Error {}

/**
 * Prompts are markdown documents with a rubric. The three ways one comes to
 * exist — written, imported from the loop's library, or drafted from an
 * experience by the loop's `design-prompt` pipeline — all end in the same
 * row. A written or imported prompt's rubric is derived once from its
 * markdown through the loop's `POST /criteria`; a generated prompt's rubric
 * is its draft's own rows, one criterion each, since the draft was judged
 * row by row and the markdown was rendered from it. Either way the rubric is
 * kept for the prompt's life: a rewrite is a different prompt, derived again
 * and authored from then on. Once a session cites the criteria the prompt is
 * locked — every read says so, and re-deriving or rewriting it is refused.
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
      experience: null,
    });
    this.em.persist(prompt);
    await this.em.flush();
    return this.view(prompt);
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
    if (!row) throw notFound('prompt-generation', `prompt generation ${runId} not found`);

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
        prompt: toPromptDto(await this.view(await this.ensureCriteria(row.prompt))),
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
    // Read as the loop read it — leniently: a field the run wrote past its
    // bound is kept whole and noted, and only a shape that is no draft is none.
    const draft = parseLenient(designPromptDraftSchema, best.artifact, DRAFT_BOUNDS);
    if (!draft.ok) {
      this.logger.warn(
        `prompt generation ${runId}: no prompt draft — ${draft.issues.map(describeIssue).join('; ')}`,
      );
      return answer({ status: 'failed', error: 'the run produced no prompt draft' });
    }
    if (draft.overruns.length > 0) {
      // Noted, not refused: the run judged the draft as written, and it is claimed so.
      this.logger.log(
        `prompt generation ${runId}: claimed with ${draft.overruns.length} field(s) past what was asked — ${draft.overruns.map(describeOverrun).join('; ')}`,
      );
    }
    const claimed = await this.claim(runId, row.experience, draft.value);
    return answer({
      status: 'complete',
      error: null,
      decision: best.decision.finalDecision,
      overall: best.decision.scores.overall,
      prompt: toPromptDto(await this.view(claimed)),
    });
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

  private async view(prompt: Prompt): Promise<PromptView> {
    const [view] = await this.views([prompt]);
    return view;
  }

  private async assertUnlocked(prompt: Prompt, refusal: string): Promise<void> {
    if ((await this.view(prompt)).rubricLocked) throw new ConflictException(refusal);
  }

  /**
   * The draft as one prompt, claimed once. Its rubric is its rows, and each
   * row a lenient read keeps composes within what the grader takes back as a
   * supplied statement — so no row is refused at the first grade; the spec
   * holds it for the longest draft a lenient read returns.
   */
  private async claim(
    runId: string,
    experience: ExperienceProfile | null,
    draft: DesignPromptDraft,
  ): Promise<Prompt> {
    const markdown = renderDesignPromptMarkdown(draft);
    const criteria = criteriaFromDraft(draft);
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
