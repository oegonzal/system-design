/**
 * Memory runs. One request with the run inputs becomes three ordinary quality
 * runs — recall, the target, the digest — and a write to the vector store,
 * sequenced here and recorded step by step. The engine and the pipelines
 * are consumed, never changed: every child goes through `RunsService.execute`.
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  MemoryRunDto,
  MemoryStepDto,
  PipelineSummary,
  QualityRunDto,
  StartQualityRunRequest,
} from '@sysdesign/contracts';
import { embeddingAvailabilityFromEnv, type EmbeddingClient } from '@sysdesign/llm';
import { describeError } from '@sysdesign/run-dump';

import type { RunListQuery } from '../../core/ports';
import { RunsService } from '../runs/runs.service';
import { bareGoal } from './compose';
import { CachedEmbeddings } from './embeddings';
import type { EmbeddingCache, MemoryPipelines, MemoryRunRepository, MemoryStore } from './ports';
import { digest, recall, StepLedger, store, target, type StepEnv } from './steps';
import {
  EMBEDDING_CACHE,
  EMBEDDING_CLIENT,
  MEMORY_PIPELINES,
  MEMORY_RUN_REPOSITORY,
  MEMORY_STORE,
} from './tokens';

const pending = (): MemoryStepDto => ({
  status: 'pending',
  reason: null,
  runId: null,
  note: null,
  counts: {},
  startedAt: null,
  finishedAt: null,
});

@Injectable()
export class MemoryService implements OnModuleInit {
  private readonly logger = new Logger(MemoryService.name);
  private readonly embeddings: CachedEmbeddings;

  constructor(
    private readonly runs: RunsService,
    @Inject(EMBEDDING_CLIENT) private readonly client: EmbeddingClient,
    @Inject(EMBEDDING_CACHE) cache: EmbeddingCache,
    @Inject(MEMORY_STORE) private readonly store: MemoryStore,
    @Inject(MEMORY_RUN_REPOSITORY) private readonly repository: MemoryRunRepository,
    @Inject(MEMORY_PIPELINES) private readonly pipelines: MemoryPipelines,
  ) {
    this.embeddings = new CachedEmbeddings(client, cache);
  }

  /** Boot only: sweep runs the previous process never finished, and say what the store can do. */
  async onModuleInit(): Promise<void> {
    const failed = await this.repository.failInterrupted();
    if (failed > 0) this.logger.warn(`marked ${failed} interrupted memory run(s) failed`);
    const availability = await this.store.verify();
    if (availability.ready) {
      this.logger.log(
        `memory store ready: ${availability.collection} (${availability.chunks} chunks)`,
      );
    } else {
      this.logger.warn(`memory store not ready: ${availability.reason ?? 'unknown'}`);
    }
  }

  get(memoryRunId: string): Promise<MemoryRunDto | null> {
    return this.repository.find(memoryRunId);
  }

  list(query: RunListQuery): Promise<[MemoryRunDto[], number]> {
    return this.repository.list(query);
  }

  /** Start in the background; the row is readable at once. */
  async start(request: StartQualityRunRequest): Promise<MemoryRunDto> {
    const record = await this.open(request, null);
    void this.perform(record, request, null);
    return record;
  }

  /** Run to completion. */
  async execute(request: StartQualityRunRequest): Promise<MemoryRunDto> {
    const record = await this.open(request, null);
    await this.perform(record, request, null);
    return record;
  }

  /** Learn from a run that already happened: digest and store, nothing else. */
  async startDigest(runId: string): Promise<MemoryRunDto> {
    const source = await this.runs.get(runId);
    if (source === null) throw new NotFoundException(`run ${runId} not found`);
    const request = { pipeline: source.pipeline, goal: source.request.goal };
    const record = await this.open(request, source);
    void this.perform(record, null, source);
    return record;
  }

  private target(pipeline: string): PipelineSummary {
    const summary = this.runs.list().find((candidate) => candidate.id === pipeline);
    if (!summary) throw new NotFoundException(`unknown pipeline ${pipeline}`);
    if (pipeline === this.pipelines.recall || pipeline === this.pipelines.digest) {
      throw new BadRequestException(`${pipeline} is a memory pipeline, not a target`);
    }
    return summary;
  }

  private async open(
    request: StartQualityRunRequest,
    provided: QualityRunDto | null,
  ): Promise<MemoryRunDto> {
    const summary = this.target(request.pipeline);
    const now = new Date().toISOString();
    const providedStep = (runId: string | null): MemoryStepDto => ({
      ...pending(),
      status: 'skipped',
      reason: 'provided-run',
      runId,
      finishedAt: now,
    });
    const record: MemoryRunDto = {
      memoryRunId: crypto.randomUUID(),
      pipeline: request.pipeline,
      status: 'running',
      startedAt: now,
      finishedAt: null,
      request: {
        goal: bareGoal(request.goal),
        outputProvided: request.output !== undefined,
        maxIterations: request.maxIterations ?? summary.policy.loop.maxIterations,
      },
      embedding: {
        enabled: this.embeddings.enabled,
        model: this.client.model,
        reason: this.embeddings.enabled ? null : embeddingAvailabilityFromEnv().reason,
      },
      store: await this.store.verify(),
      steps: {
        recall: provided ? providedStep(null) : pending(),
        target: provided ? providedStep(provided.runId) : pending(),
        digest: pending(),
        store: pending(),
      },
      error: null,
    };
    await this.repository.open(record);
    return record;
  }

  private async perform(
    record: MemoryRunDto,
    request: StartQualityRunRequest | null,
    provided: QualityRunDto | null,
  ): Promise<void> {
    const ledger = new StepLedger(
      record,
      (current) => this.repository.update(current),
      () => new Date().toISOString(),
    );
    const env: StepEnv = {
      runs: this.runs,
      embeddings: this.embeddings,
      store: this.store,
      pipelines: this.pipelines,
    };
    try {
      let source = provided;
      if (request !== null) {
        const goal = await recall(env, ledger, request.goal);
        source = await target(env, ledger, request, goal);
      }
      if (source === null) {
        record.status = 'failed';
      } else {
        const digested = await digest(env, ledger, source);
        if (digested !== null) await store(env, ledger, source, digested);
        record.status = 'complete';
      }
    } catch (error) {
      record.error = describeError(error);
      record.status = 'failed';
      for (const step of Object.values(record.steps)) {
        if (step.status === 'running')
          Object.assign(step, { status: 'failed', note: record.error.message });
      }
      this.logger.error(`memory run ${record.memoryRunId} failed: ${record.error.message}`);
    } finally {
      record.finishedAt = new Date().toISOString();
      try {
        await this.repository.close(record);
      } catch (error) {
        this.logger.error(`memory run ${record.memoryRunId}: not persisted: ${String(error)}`);
      }
      this.logger.log(`memory run ${record.memoryRunId} ${record.status}`);
    }
  }
}
