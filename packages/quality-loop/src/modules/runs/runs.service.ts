import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  DeriveCriteriaRequest,
  DerivedCriteriaDto,
  PipelineSummary,
  QualityRunDto,
  QualityRunSummaryDto,
  StartQualityRunRequest,
} from '@sysdesign/contracts';
import { qualityLoopAvailabilityFromEnv, type LlmClient, type LlmExchange } from '@sysdesign/llm';
import { describeError, GIT_CONTEXT, makeRunId } from '@sysdesign/run-dump';

import { summariseExchange, type RunRecord } from '../../core/contracts';
import { materializeCriteria } from '../../core/loop/materialize';
import { describePipeline, validatePipeline, type PipelineDefinition } from '../../core/pipeline';
import type { RunListQuery, RunRepository, TraceStore } from '../../core/ports';
import { rubricProblems } from '../../core/loop/rubric';
import { runPipeline } from '../../core/loop/run-pipeline';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM, RUN_REPOSITORY, TRACE_STORE } from './tokens';

/**
 * Runs. A run is minutes long on the subscription client, so HTTP starts one
 * and polls; the CLI awaits it. The repository is the record of truth between
 * requests and across restarts; the dump stays the full audit trail, prompts
 * included. The in-memory `RunRecord` lives only for the duration of the
 * loop, sinking exchanges as they are attributed.
 */
@Injectable()
export class RunsService implements OnModuleInit {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    @Inject(QUALITY_LOOP_LLM) private readonly llm: LlmClient,
    @Inject(PIPELINES_TOKEN)
    private readonly pipelines: ReadonlyMap<string, PipelineDefinition<unknown>>,
    @Inject(TRACE_STORE) private readonly traces: TraceStore,
    @Inject(RUN_REPOSITORY) private readonly repository: RunRepository,
  ) {
    // A malformed pipeline fails boot, never a run.
    for (const definition of pipelines.values()) validatePipeline(definition);
  }

  /** Boot only: a run still `running` that this process never saw died with the previous one. */
  async onModuleInit(): Promise<void> {
    const failed = await this.repository.failInterrupted();
    if (failed > 0) this.logger.warn(`marked ${failed} interrupted run(s) failed`);
  }

  list(): PipelineSummary[] {
    return [...this.pipelines.values()].map(describePipeline);
  }

  get(runId: string): Promise<QualityRunDto | null> {
    return this.repository.find(runId);
  }

  listRuns(query: RunListQuery): Promise<[QualityRunSummaryDto[], number]> {
    return this.repository.list(query);
  }

  /**
   * The derive-criteria stage alone: one model call, no run row, no dump.
   * Without a model the criteria are empty and the diagnostic says why —
   * a rubric is never invented.
   */
  async deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto> {
    const definition = this.resolve(request.pipeline);
    const derive = materializeCriteria(definition, this.llm, () => undefined);
    const { criteria, diagnostic } = await derive(request.goal);
    return {
      pipeline: request.pipeline,
      criteria: criteria ?? [],
      diagnostic,
      llm: this.availability(),
    };
  }

  /** Start in the background; the row is readable at once. */
  async start(request: StartQualityRunRequest): Promise<RunRecord> {
    const definition = this.resolve(request.pipeline);
    this.assertRubric(request, definition);
    const record = await this.open(request, definition);
    void this.perform(record, request, definition);
    return record;
  }

  /**
   * Run to completion — the CLI's path, and the memory module's. `onOpened`
   * hands the record over as soon as its row exists, so a caller chaining runs
   * can publish the child's id while it is still in flight.
   */
  async execute(
    request: StartQualityRunRequest,
    onOpened?: (record: RunRecord) => void,
  ): Promise<RunRecord> {
    const definition = this.resolve(request.pipeline);
    this.assertRubric(request, definition);
    const record = await this.open(request, definition);
    onOpened?.(record);
    await this.perform(record, request, definition);
    return record;
  }

  private resolve(pipeline: string): PipelineDefinition<unknown> {
    const definition = this.pipelines.get(pipeline);
    if (!definition) throw new NotFoundException(`unknown pipeline ${pipeline}`);
    return definition;
  }

  /** A rubric that does not fit the pipeline is refused before any row exists — the pipe's own 400 shape. */
  private assertRubric(
    request: StartQualityRunRequest,
    definition: PipelineDefinition<unknown>,
  ): void {
    if (request.criteria === undefined) return;
    const problems = rubricProblems(request.criteria, definition.task);
    if (problems.length > 0) {
      throw new BadRequestException({
        message: 'invalid criteria',
        issues: problems.map((message) => ({ path: 'criteria', message })),
      });
    }
  }

  private availability(): RunRecord['llm'] {
    return {
      enabled: this.llm.enabled,
      model: this.llm.model,
      reason: this.llm.enabled ? null : qualityLoopAvailabilityFromEnv().reason,
    };
  }

  private async open(
    request: StartQualityRunRequest,
    definition: PipelineDefinition<unknown>,
  ): Promise<RunRecord> {
    const record: RunRecord = {
      runId: makeRunId(Date.now(), 'quality'),
      pipeline: request.pipeline,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      llm: this.availability(),
      git: GIT_CONTEXT,
      request: {
        goal: request.goal,
        outputProvided: request.output !== undefined,
        criteriaProvided: request.criteria !== undefined,
        maxIterations: request.maxIterations ?? definition.policy.loop.maxIterations,
      },
      trace: null,
      exchanges: [],
      error: null,
    };
    await this.repository.open(record, definition.version);
    return record;
  }

  private async perform(
    record: RunRecord,
    request: StartQualityRunRequest,
    definition: PipelineDefinition<unknown>,
  ): Promise<void> {
    // Exchange writes are chained, never awaited by the loop: order is kept,
    // a slow database never stalls a model call, and a failed write is logged.
    let writes: Promise<void> = Promise.resolve();
    const sink = (exchange: LlmExchange) => {
      record.exchanges.push(exchange);
      const summaries = record.exchanges.map(summariseExchange);
      writes = writes
        .then(() => this.repository.recordExchange(record.runId, summaries))
        .catch((error: unknown) =>
          this.logger.warn(`run ${record.runId}: exchange not recorded: ${String(error)}`),
        );
    };
    try {
      record.trace = await runPipeline(
        definition,
        {
          goal: request.goal,
          output: request.output,
          maxIterations: request.maxIterations,
          criteria: request.criteria,
        },
        { llm: this.llm, sink, now: Date.now },
      );
      record.status = 'complete';
    } catch (error) {
      record.error = describeError(error);
      record.status = 'failed';
      this.logger.error(`run ${record.runId} failed: ${record.error.message}`);
    } finally {
      record.finishedAt = new Date().toISOString();
      this.traces.save(record, describePipeline(definition));
      await writes;
      try {
        await this.repository.close(record);
      } catch (error) {
        this.logger.error(`run ${record.runId}: not persisted: ${String(error)}`);
      }
    }
  }
}
