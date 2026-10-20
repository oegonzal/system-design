import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  criteriaFromDraft,
  DEFAULT_PRACTICE_FORMAT,
  describeIssue,
  describeOverrun,
  designPromptDraftSchema,
  modelSchema,
  parseLenient,
  practiceFormatForKind,
  PROMPT_PIPELINE_ID,
  renderDesignPromptMarkdown,
  type CanvasCriterionKind,
  type DesignPromptDraft,
  type GeneratePromptRequest,
  type PracticeFormatId,
  type PromptGenerationDto,
  type QualityRunDto,
  type QualityRunStartedDto,
} from '@sysdesign/contracts';
import { ExperienceProfile, Prompt, PromptGeneration } from '@sysdesign/db';

import { notFound } from '../../common/not-found';
import { ProgressService } from '../progress/progress.service';
import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import { renderExperienceGoal } from './experience-goal';
import { toPromptDto } from './prompts.mapper';
import { PromptsService } from './prompts.service';

/** The prompt pipeline writes, is criticised, and rewrites once. */
const GENERATION_ITERATIONS = 2;

/** The draft's declared bounds, indexed once: what a claim measures the run's fields against. */
const DRAFT_BOUNDS = modelSchema(designPromptDraftSchema).bounds;

/** Thrown inside the claim transaction when another poll claimed first; rolls the transaction back. */
class AlreadyClaimed extends Error {}

/** What the writer is asked for: a format, and the kinds to lean on. */
interface GenerationBrief {
  format: PracticeFormatId;
  emphasis: CanvasCriterionKind[];
}

/**
 * A prompt drafted from an experience by the loop's `design-prompt` pipeline.
 * The run is the loop's; the row here remembers which experience it was
 * drawn from, the format it was asked for and, once claimed, which prompt it
 * became. A request that names no format is pointed at the author's weakest
 * competency: the first declared format that emphasises it, with that kind
 * emphasised — so "surprise me" practises what the record says needs it,
 * and the whole system by default while too little has been graded to say.
 */
@Injectable()
export class PromptGenerationService {
  private readonly logger = new Logger(PromptGenerationService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
    private readonly prompts: PromptsService,
    private readonly progress: ProgressService,
  ) {}

  /** Start a draft from an experience — the named one, or the least practised so repeated practice covers every experience. */
  async start(request: GeneratePromptRequest): Promise<QualityRunStartedDto> {
    const experience = request.experienceId
      ? await this.prompts.experience(request.experienceId)
      : await this.leastPractised();
    const { format, emphasis } = await this.brief(request);
    const started = await this.loop.startRun({
      pipeline: PROMPT_PIPELINE_ID,
      goal: renderExperienceGoal(experience, { format, emphasis }),
      maxIterations: GENERATION_ITERATIONS,
    });
    this.em.persist(this.em.create(PromptGeneration, { runId: started.runId, experience, format }));
    await this.em.flush();
    return started;
  }

  /**
   * The run's state, and — the first time it is read complete — the best
   * draft claimed into a prompt. Claiming is a conditional update, so two
   * concurrent polls create one prompt and both answer with it.
   */
  async read(runId: string): Promise<PromptGenerationDto> {
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
        prompt: toPromptDto(await this.prompts.view(await this.prompts.ensureCriteria(row.prompt))),
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
    const claimed = await this.claim(runId, row.experience, row.format, draft.value);
    return answer({
      status: 'complete',
      error: null,
      decision: best.decision.finalDecision,
      overall: best.decision.scores.overall,
      prompt: toPromptDto(await this.prompts.view(claimed)),
    });
  }

  /** The format and emphasis asked for, or the ones the author's weakest competency calls for. */
  private async brief(request: GeneratePromptRequest): Promise<GenerationBrief> {
    const asked = [...new Set(request.emphasis ?? [])];
    if (request.format !== undefined) return { format: request.format, emphasis: asked };
    const weakest = await this.progress.weakestKind();
    if (weakest === null) return { format: DEFAULT_PRACTICE_FORMAT, emphasis: asked };
    return {
      format: practiceFormatForKind(weakest),
      emphasis: asked.includes(weakest) ? asked : [...asked, weakest],
    };
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
   * The draft as one prompt, claimed once. Its rubric is its rows, and each
   * row a lenient read keeps composes within what the grader takes back as a
   * supplied statement — so no row is refused at the first grade; the spec
   * holds it for the longest draft a lenient read returns.
   */
  private async claim(
    runId: string,
    experience: ExperienceProfile | null,
    format: PracticeFormatId,
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
          format,
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
