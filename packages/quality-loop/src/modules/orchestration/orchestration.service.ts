/**
 * Orchestration runs. One request becomes the child runs a declared
 * orchestrator maps out, sequenced by the generic runner and recorded step by
 * step. The engine and the pipelines are consumed, never changed: every child
 * goes through `RunsService.execute`.
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
  OrchestrationRunDto,
  QualityRunDto,
  StartOrchestrationFromRunRequest,
  StartOrchestrationRequest,
} from '@sysdesign/contracts';
import { DEFAULT_QUALITY_RUN_ITERATIONS } from '@sysdesign/contracts';
import { z } from 'zod';

import { validateOrchestrator } from '../../orchestrators/definition';
import { openRecord, runOrchestration } from '../../orchestrators/run-orchestration';
import { RunsService } from '../runs/runs.service';
import type { OrchestrationListQuery, OrchestrationRunRepository, OrchestratorHost } from './ports';
import { ORCHESTRATION_RUN_REPOSITORY, ORCHESTRATOR_HOSTS } from './tokens';

/** An orchestration run id is a uuid; anything else cannot be a row, so it is not found rather than a database error. */
const orchestrationRunId = z.uuid();

@Injectable()
export class OrchestrationService implements OnModuleInit {
  private readonly logger = new Logger(OrchestrationService.name);

  constructor(
    private readonly runs: RunsService,
    @Inject(ORCHESTRATION_RUN_REPOSITORY) private readonly repository: OrchestrationRunRepository,
    @Inject(ORCHESTRATOR_HOSTS) private readonly hosts: ReadonlyMap<string, OrchestratorHost>,
  ) {
    // A malformed orchestrator fails boot, never a run.
    for (const host of hosts.values()) validateOrchestrator(host.definition);
  }

  /** Boot only: sweep runs the previous process never finished. */
  async onModuleInit(): Promise<void> {
    const failed = await this.repository.failInterrupted();
    if (failed > 0) this.logger.warn(`marked ${failed} interrupted orchestration run(s) failed`);
  }

  async get(id: string): Promise<OrchestrationRunDto | null> {
    if (!orchestrationRunId.safeParse(id).success) return null;
    const record = await this.repository.find(id);
    return record === null ? null : this.sequenced(record);
  }

  async list(query: OrchestrationListQuery): Promise<[OrchestrationRunDto[], number]> {
    const [records, total] = await this.repository.list(query);
    return [records.map((record) => this.sequenced(record)), total];
  }

  /**
   * The steps in declared order. The row stores them as jsonb, which keeps no
   * key order; the definition is the source of it, so a record reads back the
   * way its orchestrator declared it.
   */
  private sequenced(record: OrchestrationRunDto): OrchestrationRunDto {
    const host = this.hosts.get(record.orchestrator);
    if (!host) return record;
    const declared = host.definition.steps.map((step) => step.id);
    const rest = Object.keys(record.steps).filter((id) => !declared.includes(id));
    return {
      ...record,
      steps: Object.fromEntries(
        [...declared, ...rest]
          .filter((id) => id in record.steps)
          .map((id) => [id, record.steps[id]]),
      ),
    };
  }

  /** Start in the background; the row is readable at once. */
  async start(
    orchestrator: string,
    request: StartOrchestrationRequest,
  ): Promise<OrchestrationRunDto> {
    const host = this.host(orchestrator);
    const normalized = this.admit(host, request);
    const record = await this.open(host, normalized, null);
    void this.perform(host, record, normalized, null);
    return record;
  }

  /**
   * Start from a run that already happened. Where a step declares a stand-in,
   * the source stands in for it; otherwise the source is only the request's
   * origin — its goal and budget — and the record says nothing of it, since
   * every step then runs afresh over those inputs.
   */
  async startFromRun(
    orchestrator: string,
    body: StartOrchestrationFromRunRequest,
  ): Promise<OrchestrationRunDto> {
    const host = this.host(orchestrator);
    const source = await this.runs.get(body.runId);
    if (source === null) throw new NotFoundException(`run ${body.runId} not found`);
    const normalized = this.admit(host, {
      ...(host.definition.takesTarget ? { pipeline: source.pipeline } : {}),
      goal: source.request.goal,
      maxIterations: source.request.maxIterations,
      ...(body.samples === undefined ? {} : { samples: body.samples }),
    });
    const provided = host.definition.steps.some((step) => step.provided !== undefined)
      ? source
      : null;
    const record = await this.open(host, normalized, provided);
    void this.perform(host, record, normalized, provided);
    return record;
  }

  private host(orchestrator: string): OrchestratorHost {
    const host = this.hosts.get(orchestrator);
    if (!host) throw new NotFoundException(`unknown orchestrator ${orchestrator}`);
    return host;
  }

  /**
   * The request as the orchestrator will see it, or the reason it will not.
   * The declaration decides whether a target is named at all; a named one
   * must be registered; the orchestrator's own `refuse` says the rest.
   */
  private admit(
    host: OrchestratorHost,
    request: StartOrchestrationRequest,
  ): StartOrchestrationRequest {
    const normalized = host.definition.normalize?.(request) ?? request;
    const { id, takesTarget } = host.definition;
    if (takesTarget && normalized.pipeline === undefined) {
      throw new BadRequestException(`${id} takes a target pipeline; name one`);
    }
    if (!takesTarget && normalized.pipeline !== undefined) {
      throw new BadRequestException(`${id} chooses its own pipeline; do not name one`);
    }
    const summaries = this.runs.list();
    if (
      normalized.pipeline !== undefined &&
      !summaries.some((summary) => summary.id === normalized.pipeline)
    ) {
      throw new NotFoundException(`unknown pipeline ${normalized.pipeline}`);
    }
    const refusal = host.definition.refuse?.(normalized, summaries);
    if (refusal !== null && refusal !== undefined) throw new BadRequestException(refusal);
    return normalized;
  }

  private async open(
    host: OrchestratorHost,
    request: StartOrchestrationRequest,
    provided: QualityRunDto | null,
  ): Promise<OrchestrationRunDto> {
    const summary = this.runs.list().find((candidate) => candidate.id === request.pipeline);
    const maxIterations =
      provided?.request.maxIterations ??
      request.maxIterations ??
      summary?.policy.loop.maxIterations ??
      DEFAULT_QUALITY_RUN_ITERATIONS;
    const record = openRecord(
      host.definition,
      request,
      provided,
      await host.definition.context(host.ports),
      maxIterations,
      () => new Date().toISOString(),
    );
    await this.repository.open(record);
    return record;
  }

  private async perform(
    host: OrchestratorHost,
    record: OrchestrationRunDto,
    request: StartOrchestrationRequest,
    provided: QualityRunDto | null,
  ): Promise<void> {
    const label = `${host.definition.id} run ${record.orchestrationRunId}`;
    try {
      await runOrchestration(host.definition, record, request, provided, {
        ports: host.ports,
        pipelines: () => this.runs.list(),
        execute: (child, onOpened) => this.runs.execute(child, onOpened),
        flush: (current) => this.repository.update(current),
        now: () => new Date().toISOString(),
        warn: (message) => this.logger.warn(`${label}: ${message}`),
      });
    } finally {
      try {
        await this.repository.close(record);
      } catch (error) {
        this.logger.error(`${label}: not persisted: ${String(error)}`);
      }
      this.logger.log(`${label} ${record.status}`);
    }
  }
}
