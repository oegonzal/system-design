import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  sameRubric,
  type DeriveCriteriaRequest,
  type DerivedCriteriaDto,
  type IterationTrace,
  type PipelineSummary,
  type QualityRunDto,
  type QualityRunSummaryDto,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';
import type { LlmClient, LlmExchange } from '@sysdesign/llm';
import { describeError, gitContext, makeRunId } from '@sysdesign/run-dump';

import { summariseExchange, type RunProgress, type RunRecord } from '../../core/contracts';
import { materializeCriteria } from '../../core/loop/materialize';
import { describePipeline, validatePipeline, type PipelineDefinition } from '../../core/pipeline';
import type { RunListQuery, RunRepository, TraceStore } from '../../core/ports';
import { rubricProblems } from '../../core/loop/rubric';
import { runPipeline } from '../../core/loop/run-pipeline';
import { orNotFound } from '../http/or-not-found';
import type { RunJanitorOptions } from '../janitor/stale-after';
import { RUN_JANITOR_OPTIONS } from '../janitor/tokens';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM, RUN_REPOSITORY, TRACE_STORE } from './tokens';

/**
 * Runs. A run is minutes long on the subscription client, so HTTP starts one
 * and polls; the CLI awaits it. The repository is the record of truth between
 * requests and across restarts; the dump stays the full audit trail, prompts
 * included. The in-memory `RunRecord` lives only for the duration of the
 * loop, sinking exchanges as they are attributed.
 */
@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    @Inject(QUALITY_LOOP_LLM) private readonly llm: LlmClient,
    @Inject(PIPELINES_TOKEN)
    private readonly registry: ReadonlyMap<string, PipelineDefinition<unknown>>,
    @Inject(TRACE_STORE) private readonly traces: TraceStore,
    @Inject(RUN_REPOSITORY) private readonly repository: RunRepository,
    @Inject(RUN_JANITOR_OPTIONS) private readonly janitor: RunJanitorOptions,
  ) {
    // A malformed pipeline fails boot, never a run.
    for (const definition of registry.values()) validatePipeline(definition);
  }

  /** Every registered pipeline as the wire describes it. */
  pipelines(): PipelineSummary[] {
    return [...this.registry.values()].map(describePipeline);
  }

  /** One registered pipeline as the wire describes it; a name that is not registered is a 404. */
  summary(pipeline: string): PipelineSummary {
    return describePipeline(this.resolve(pipeline));
  }

  /** The summary when the pipeline is named and registered, else undefined — no 404. */
  summaryOf(pipeline: string | undefined): PipelineSummary | undefined {
    const definition = pipeline === undefined ? undefined : this.registry.get(pipeline);
    return definition === undefined ? undefined : describePipeline(definition);
  }

  get(runId: string): Promise<QualityRunDto | null> {
    return this.repository.find(runId);
  }

  listRuns(query: RunListQuery): Promise<[QualityRunSummaryDto[], number]> {
    return this.repository.list(query);
  }

  /**
   * The derive-criteria stage alone: one model call, no run row, no dump.
   * When the model derives nothing the criteria are empty and the diagnostic
   * says why — the controller turns that into 503; a rubric is never invented.
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
    const adopted = await this.resolveAdoption(request, definition);
    const record = await this.open(request, definition);
    void this.perform(record, request, definition, adopted);
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
    const adopted = await this.resolveAdoption(request, definition);
    const record = await this.open(request, definition);
    onOpened?.(record);
    await this.perform(record, request, definition, adopted);
    return record;
  }

  /**
   * The recorded iteration an adopting request starts from — or a 400 that
   * names what does not line up: the run, its pipeline or version, the
   * iteration, or a rubric that is not the one it was judged against. Read
   * before the row opens, so a refused adoption leaves nothing behind.
   */
  private async resolveAdoption(
    request: StartQualityRunRequest,
    definition: PipelineDefinition<unknown>,
  ): Promise<IterationTrace | undefined> {
    const { adopt } = request;
    if (adopt === undefined) return undefined;
    // Declared with its type so the compiler narrows after each call.
    const refuse: (message: string, path?: 'adopt' | 'criteria') => never = (
      message,
      path = 'adopt',
    ) => {
      throw new BadRequestException({ message: 'invalid adopt', issues: [{ path, message }] });
    };
    if (request.output !== undefined) refuse('output and adopt are mutually exclusive');
    if (request.criteria === undefined) {
      refuse('adopt requires the rubric the adopted run was judged against', 'criteria');
    }
    const source = await this.repository.find(adopt.runId);
    if (source === null) refuse(`run ${adopt.runId} not found`);
    if (source.pipeline !== definition.id) {
      refuse(`run ${adopt.runId} ran ${source.pipeline}, not ${definition.id}`);
    }
    // Its status, not its trace: a running run's iterations so far are not a verdict to adopt.
    if (source.status !== 'complete' || source.trace === null) {
      refuse(`run ${adopt.runId} never completed`);
    }
    if (source.trace.pipeline.version !== definition.version) {
      refuse(
        `run ${adopt.runId} was judged by ${definition.id}@${source.trace.pipeline.version}, not @${definition.version}`,
      );
    }
    const iteration = source.trace.iterations.find((it) => it.iteration === adopt.iteration);
    if (iteration === undefined) refuse(`run ${adopt.runId} has no iteration ${adopt.iteration}`);
    if (!sameRubric(request.criteria ?? [], source.trace.contract.criteria)) {
      refuse(`the rubric is not the one run ${adopt.runId} was judged against`, 'criteria');
    }
    return iteration;
  }

  private resolve(pipeline: string): PipelineDefinition<unknown> {
    return orNotFound(this.registry.get(pipeline), `unknown pipeline ${pipeline}`);
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

  /** Which model backs this process — a booted loop always has one. */
  private availability(): RunRecord['llm'] {
    return { model: this.llm.model };
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
      git: gitContext(),
      request: {
        goal: request.goal,
        outputProvided: request.output !== undefined,
        criteriaProvided: request.criteria !== undefined,
        adoptedFrom: request.adopt ?? null,
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
    adopted: IterationTrace | undefined,
  ): Promise<void> {
    // The row is alive while this process says so: a model call can run for
    // minutes with no exchange to record, so the heartbeat ticks on its own.
    const ticker = heartbeatTicker(
      () => this.repository.heartbeat(record.runId),
      this.janitor.staleAfterMs,
      (error) => this.logger.warn(`run ${record.runId}: heartbeat not written: ${String(error)}`),
    );
    // Live writes are chained, never awaited by the loop: order is kept, a
    // slow database never stalls a model call, and a failed write is logged.
    let writes: Promise<void> = Promise.resolve();
    const write = (what: string, task: () => Promise<void>) => {
      writes = writes
        .then(task)
        .catch((error: unknown) =>
          this.logger.warn(`run ${record.runId}: ${what} not recorded: ${String(error)}`),
        );
    };
    const sink = (exchange: LlmExchange) => {
      record.exchanges.push(exchange);
      const summaries = record.exchanges.map(summariseExchange);
      write('exchange', () => this.repository.recordExchange(record.runId, summaries));
    };
    // Each finished iteration is published as it lands — an adopted one at
    // once — so a reader sees the run's progress, not only its end.
    const onIteration = (progress: RunProgress) =>
      write('progress', () => this.repository.recordProgress(record.runId, progress));
    try {
      record.trace = await runPipeline(
        definition,
        {
          goal: request.goal,
          output: request.output,
          maxIterations: request.maxIterations,
          criteria: request.criteria,
          adopted,
        },
        { llm: this.llm, sink, now: Date.now, onIteration },
      );
      record.status = 'complete';
    } catch (error) {
      record.error = describeError(error);
      record.status = 'failed';
      this.logger.error(`run ${record.runId} failed: ${record.error.message}`);
    } finally {
      ticker.stop();
      record.finishedAt = new Date().toISOString();
      this.traces.save(record, describePipeline(definition));
      await writes;
      try {
        const outcome = await this.repository.close(record);
        if (outcome === 'reclaimed') {
          this.logger.warn(
            `run ${record.runId}: the janitor had failed this row as interrupted; overwrote it with the true outcome`,
          );
        } else if (outcome === 'refused') {
          this.logger.error(`run ${record.runId}: not persisted: the row is already terminal`);
        }
      } catch (error) {
        this.logger.error(`run ${record.runId}: not persisted: ${String(error)}`);
      }
    }
  }
}

/**
 * An unref'd interval that refreshes a running row's heartbeat a few times
 * per stale threshold, so a long model call never lets the janitor mistake a
 * live run for a dead one. Never awaited; a failed write is only logged.
 */
export function heartbeatTicker(
  beat: () => Promise<void>,
  staleAfterMs: number,
  warn: (error: unknown) => void,
): { stop(): void } {
  const timer = setInterval(() => void beat().catch(warn), Math.max(1000, staleAfterMs / 3));
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
