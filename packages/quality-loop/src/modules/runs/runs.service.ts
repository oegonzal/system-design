import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { qualityLoopAvailabilityFromEnv, type LlmClient } from '@sysdesign/llm';
import { describeError, GIT_CONTEXT, makeRunId } from '@sysdesign/run-dump';

import type { RunRecord, RunRequest } from '../../core/contracts';
import {
  describePipeline,
  validatePipeline,
  type PipelineDefinition,
  type PipelineSummary,
} from '../../core/pipeline';
import type { TraceStore } from '../../core/ports';
import { runPipeline } from '../../core/run-pipeline';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM, TRACE_STORE } from './tokens';

/**
 * Runs, and the in-memory index of them. A run is minutes long on the
 * subscription client, so HTTP starts one and polls; the CLI awaits it. The
 * dump is the durable record — this map forgets on restart, by design.
 */
@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);
  private readonly records = new Map<string, RunRecord>();

  constructor(
    @Inject(QUALITY_LOOP_LLM) private readonly llm: LlmClient,
    @Inject(PIPELINES_TOKEN)
    private readonly pipelines: ReadonlyMap<string, PipelineDefinition<unknown>>,
    @Inject(TRACE_STORE) private readonly traces: TraceStore,
  ) {
    // A malformed pipeline fails boot, never a run.
    for (const definition of pipelines.values()) validatePipeline(definition);
  }

  list(): PipelineSummary[] {
    return [...this.pipelines.values()].map(describePipeline);
  }

  get(runId: string): RunRecord | null {
    return this.records.get(runId) ?? null;
  }

  /** Start in the background; the record is readable at once. */
  start(request: RunRequest): RunRecord {
    const definition = this.resolve(request.pipeline);
    const record = this.open(request, definition);
    void this.perform(record, request, definition);
    return record;
  }

  /** Run to completion — the CLI's path. */
  async execute(request: RunRequest): Promise<RunRecord> {
    const definition = this.resolve(request.pipeline);
    const record = this.open(request, definition);
    await this.perform(record, request, definition);
    return record;
  }

  private resolve(pipeline: string): PipelineDefinition<unknown> {
    const definition = this.pipelines.get(pipeline);
    if (!definition) throw new NotFoundException(`unknown pipeline ${pipeline}`);
    return definition;
  }

  private open(request: RunRequest, definition: PipelineDefinition<unknown>): RunRecord {
    const record: RunRecord = {
      runId: makeRunId(Date.now(), 'quality'),
      pipeline: request.pipeline,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      // Availability from the client that will actually answer; the reason it
      // is off comes from the environment, never the key.
      llm: {
        enabled: this.llm.enabled,
        model: this.llm.model,
        reason: this.llm.enabled ? null : qualityLoopAvailabilityFromEnv().reason,
      },
      git: GIT_CONTEXT,
      request: {
        goal: request.goal,
        outputProvided: request.output !== undefined,
        maxIterations: request.maxIterations ?? definition.policy.loop.maxIterations,
      },
      trace: null,
      exchanges: [],
      error: null,
    };
    this.records.set(record.runId, record);
    return record;
  }

  private async perform(
    record: RunRecord,
    request: RunRequest,
    definition: PipelineDefinition<unknown>,
  ): Promise<void> {
    try {
      record.trace = await runPipeline(
        definition,
        { goal: request.goal, output: request.output, maxIterations: request.maxIterations },
        { llm: this.llm, sink: (exchange) => record.exchanges.push(exchange), now: Date.now },
      );
      record.status = 'complete';
    } catch (error) {
      record.error = describeError(error);
      record.status = 'failed';
      this.logger.error(`run ${record.runId} failed: ${record.error.message}`);
    } finally {
      record.finishedAt = new Date().toISOString();
      this.traces.save(record, describePipeline(definition));
    }
  }
}
