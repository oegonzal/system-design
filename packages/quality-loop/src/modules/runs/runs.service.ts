import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  openedAs,
  openingRecall,
  recallInProgress,
  recallWithout,
  type DeriveCriteriaRequest,
  type DerivedCriteriaDto,
  type IterationEvidenceDto,
  type IterationRef,
  type PipelineSummary,
  type QualityRunDto,
  type QualityRunReadDto,
  type QualityRunSummaryDto,
  type RunRecallDto,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';
import type { LlmClient, LlmExchange } from '@sysdesign/llm';
import { describeError, gitContext, makeRunId } from '@sysdesign/run-dump';

import { toRunDto, type RunRecord } from '../../core/contracts';
import { materializeCriteria } from '../../core/loop/materialize';
import { describePipeline } from '../../core/describe-pipeline';
import { readoutOf } from '../../core/outputs';
import { validatePipeline } from '../../core/validate-pipeline';
import { type PipelineDefinition } from '../../core/pipeline';
import type { AdvisoryMemory, RunListQuery, RunRepository, TraceStore } from '../../core/ports';
import { runPipeline } from '../../core/loop/run-pipeline';
import { orNotFound } from '../http/or-not-found';
import { admitRun, type Adoption } from './run-admission';
import { RunRecorder } from './run-recorder';
import type { RunJanitorOptions } from '../janitor/stale-after';
import { RUN_JANITOR_OPTIONS } from '../janitor/tokens';
import {
  briefingOf,
  type RecallBase,
  type RunRecallRecorder,
  type RunRecallSlot,
} from './recall/run-recall';
import {
  PIPELINES_TOKEN,
  QUALITY_LOOP_LLM,
  RUN_RECALL_RECORDER,
  RUN_RECALL_SLOT,
  RUN_REPOSITORY,
  TRACE_STORE,
} from './tokens';

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
    @Inject(RUN_RECALL_SLOT) private readonly recall: RunRecallSlot,
    @Inject(RUN_RECALL_RECORDER) private readonly recalls: RunRecallRecorder,
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

  /** One run as its read answers it: the record, and its readout once settled — read by the definition registered under its pipeline. */
  async get(runId: string): Promise<QualityRunReadDto | null> {
    const run = await this.repository.find(runId);
    return run === null
      ? null
      : { ...run, readout: readoutOf(this.registry.get(run.pipeline), run) };
  }

  listRuns(query: RunListQuery): Promise<[QualityRunSummaryDto[], number]> {
    return this.repository.list(query);
  }

  /** The verdicts of named iterations, read together; an iteration never recorded is left out. */
  evidence(refs: readonly IterationRef[]): Promise<IterationEvidenceDto[]> {
    return this.repository.evidenceFor(refs);
  }

  /**
   * The derive-criteria stage alone: one model call and no run row. When the
   * model derives nothing the criteria are empty and the diagnostic says why —
   * the controller turns that into 503; a rubric is never invented. The call
   * is dumped as its own folder either way, so the rubric every run of a
   * session is judged by can be read where it was made.
   */
  async deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto> {
    const definition = this.resolve(request.pipeline);
    const startedAt = new Date();
    const exchanges: LlmExchange[] = [];
    const derive = materializeCriteria(definition, this.llm, (exchange) => {
      exchanges.push(exchange);
    });
    const { criteria, diagnostic } = await derive(request.goal);
    const derived = {
      pipeline: request.pipeline,
      criteria: criteria ?? [],
      diagnostic,
      llm: this.availability(),
    };
    const dumpRunId = this.traces.saveCriteria({
      runId: makeRunId(startedAt.getTime(), 'criteria'),
      pipeline: describePipeline(definition),
      goal: request.goal,
      criteria: derived.criteria,
      diagnostic,
      llm: derived.llm,
      git: gitContext(),
      exchanges,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    });
    return { ...derived, dumpRunId };
  }

  /** Start in the background; the row is readable at once. */
  async start(request: StartQualityRunRequest): Promise<RunRecord> {
    const { definition, adopted } = await this.admit(request);
    const record = await this.open(request, definition, null);
    void this.perform(record, request, definition, adopted);
    return record;
  }

  /**
   * Run to completion — the CLI's path, and the memory module's. `onOpened`
   * hands the record over as soon as its row exists, so a caller chaining runs
   * can publish the child's id while it is still in flight.
   */
  execute(
    request: StartQualityRunRequest,
    onOpened?: (record: RunRecord) => void,
  ): Promise<RunRecord> {
    return this.executeFor(null, request, onOpened);
  }

  /**
   * `execute`, for a run opened by another: the child's row names its parent
   * from the moment it exists. Only this service opens one — a run's recall
   * — so the link follows from what the parent declared and is never asked
   * for on the wire.
   */
  private async executeFor(
    parentRunId: string | null,
    request: StartQualityRunRequest,
    onOpened?: (record: RunRecord) => void,
  ): Promise<RunRecord> {
    const { definition, adopted } = await this.admit(request);
    const record = await this.open(request, definition, parentRunId);
    onOpened?.(record);
    await this.perform(record, request, definition, adopted);
    return record;
  }

  /** A known pipeline, then everything else a run must pass before its row exists. */
  private async admit(
    request: StartQualityRunRequest,
  ): Promise<{ definition: PipelineDefinition<unknown>; adopted: Adoption | undefined }> {
    const definition = this.resolve(request.pipeline);
    return { definition, adopted: await admitRun(request, definition, this.repository) };
  }

  private resolve(pipeline: string): PipelineDefinition<unknown> {
    return orNotFound(this.registry.get(pipeline), `unknown pipeline ${pipeline}`);
  }

  /** Which model backs this process — a booted loop always has one. */
  private availability(): RunRecord['llm'] {
    return { model: this.llm.model };
  }

  private async open(
    request: StartQualityRunRequest,
    definition: PipelineDefinition<unknown>,
    parentRunId: string | null,
  ): Promise<RunRecord> {
    const summary: RunRecord['request'] = {
      goal: request.goal,
      outputProvided: request.output !== undefined,
      criteriaProvided: request.criteria !== undefined,
      adoptedFrom: request.adopt ?? null,
      maxIterations: request.maxIterations ?? definition.policy.loop.maxIterations,
      acceptAt: request.acceptAt ?? null,
    };
    const record: RunRecord = {
      runId: makeRunId(Date.now(), 'quality'),
      pipeline: request.pipeline,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      // Alive as of its start; every beat and every write moves it, and the finish settles it.
      heartbeatAt: new Date().toISOString(),
      llm: this.availability(),
      git: gitContext(),
      request: summary,
      parentRunId,
      openedBy: request.openedBy ?? null,
      // Decided from the request as the row opens. A run that asked is
      // recalling from the moment the row exists, so a reader polling it sees
      // that before anything else moves — unless it can never call its
      // producer, the only stage lessons reach: that one is skipped at once.
      recall: openingRecall(request.recall === true, summary),
      trace: null,
      exchanges: [],
      error: null,
    };
    await this.repository.open(record, definition.version);
    return record;
  }

  /**
   * The lessons a run that asked to recall hands its producer — and never a
   * reason to fail it. The recall run is an ordinary run opened for this one:
   * it names this run as its parent, and this run names it as soon as it
   * opens. Whatever the recall comes to, or whatever it throws, is published
   * on the run, and the run goes on with what it got.
   */
  private async recallLessons(
    record: RunRecord,
    publish: (recall: RunRecallDto) => void,
    base: RecallBase | undefined,
  ): Promise<AdvisoryMemory[]> {
    // Not asked, or settled as the row opened: nothing to recall.
    if (record.recall?.status !== 'recalling') return [];
    const bound = this.recall.bound;
    let outcome: RunRecallDto;
    if (bound === null) {
      outcome = recallWithout('recall-unavailable');
    } else {
      let recallRunId: string | null = null;
      // A recall run is opened by whoever opened the run it serves.
      const execute = async (child: StartQualityRunRequest): Promise<QualityRunDto> =>
        toRunDto(
          await this.executeFor(record.runId, openedAs(child, record.openedBy), (opened) => {
            recallRunId = opened.runId;
            publish({ ...recallInProgress(), recallRunId });
          }),
        );
      try {
        outcome = await bound.recall(record.request.goal, execute, base);
      } catch (error) {
        outcome = recallWithout('errored', describeError(error).message, recallRunId);
      }
    }
    publish(outcome);
    this.logger.log(
      `run ${record.runId}: recall ${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ''}, ${outcome.count} lesson(s)${outcome.recallRunId ? ` from ${outcome.recallRunId}` : ''}`,
    );
    return briefingOf(outcome.lessons);
  }

  private async perform(
    record: RunRecord,
    request: StartQualityRunRequest,
    definition: PipelineDefinition<unknown>,
    adoption: Adoption | undefined,
  ): Promise<void> {
    const recorder = new RunRecorder(
      record,
      {
        repository: this.repository,
        recalls: this.recalls,
        traces: this.traces,
        logger: this.logger,
      },
      this.janitor.staleAfterMs,
    );
    try {
      const memories = await this.recallLessons(
        record,
        recorder.onRecall,
        recallBaseOf(request, definition, adoption),
      );
      recorder.complete(
        await runPipeline(
          definition,
          {
            goal: request.goal,
            output: request.output,
            maxIterations: request.maxIterations,
            acceptAt: request.acceptAt,
            criteria: request.criteria,
            adopted: adoption?.iteration,
            memories,
          },
          { llm: this.llm, sink: recorder.sink, now: Date.now, onIteration: recorder.onIteration },
        ),
      );
    } catch (error) {
      recorder.fail(error);
    } finally {
      await recorder.close(describePipeline(definition));
    }
  }
}

/**
 * A run that adopted a judged iteration recalls for what is wrong with it,
 * and screens out what its producer already holds of it.
 */
const recallBaseOf = (
  request: StartQualityRunRequest,
  definition: PipelineDefinition<unknown>,
  adoption: Adoption | undefined,
): RecallBase | undefined =>
  adoption !== undefined && request.adopt !== undefined
    ? {
        runId: request.adopt.runId,
        pipeline: definition.id,
        iteration: adoption.iteration,
        criteria: request.criteria ?? [],
        adoptedFrom: adoption.adoptedFrom,
      }
    : undefined;
