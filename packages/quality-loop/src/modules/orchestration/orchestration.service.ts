/**
 * Orchestration runs. One request becomes the child runs a declared
 * orchestrator maps out, sequenced by the generic runner and recorded step by
 * step. The engine and the pipelines are consumed, never changed: every child
 * goes through `RunsService.execute`.
 */
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  OrchestrationRunDto,
  QualityRunDto,
  StartOrchestrationFromRunRequest,
  StartOrchestrationRequest,
} from '@sysdesign/contracts';
import { DEFAULT_QUALITY_RUN_ITERATIONS } from '@sysdesign/contracts';

import { validateOrchestrator } from '../../orchestrators/runner/definition';
import { openRecord } from '../../orchestrators/runner/record';
import { runOrchestration } from '../../orchestrators/runner/run-orchestration';
import { orNotFound } from '../http/or-not-found';
import type { RunJanitorOptions } from '../janitor/stale-after';
import { RUN_JANITOR_OPTIONS } from '../janitor/tokens';
import { heartbeatTicker, RunsService } from '../runs/runs.service';
import { isOrchestrationRunId } from './orchestration-request';
import type { OrchestrationListQuery, OrchestrationRunRepository, OrchestratorHost } from './ports';
import { ORCHESTRATION_RUN_REPOSITORY, ORCHESTRATOR_HOSTS } from './tokens';

@Injectable()
export class OrchestrationService {
  private readonly logger = new Logger(OrchestrationService.name);

  constructor(
    private readonly runs: RunsService,
    @Inject(ORCHESTRATION_RUN_REPOSITORY) private readonly repository: OrchestrationRunRepository,
    @Inject(ORCHESTRATOR_HOSTS) private readonly hosts: ReadonlyMap<string, OrchestratorHost>,
    @Inject(RUN_JANITOR_OPTIONS) private readonly janitor: RunJanitorOptions,
  ) {
    // A malformed orchestrator fails boot, never a run.
    for (const host of hosts.values()) validateOrchestrator(host.definition);
  }

  async get(id: string): Promise<OrchestrationRunDto | null> {
    if (!isOrchestrationRunId(id)) return null;
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
    // BOOKMARK - great example for really drilling down on IoC understanding **personal note**
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
    const source = orNotFound(await this.runs.get(body.runId), `run ${body.runId} not found`);
    // Two different questions. Which run to seed: any step that stands in wants
    // it. Whether the composed-goal refusal may be waived: EVERY step that
    // would run the target must stand in, or one of them still runs it —
    // `second-opinion` stands in for its first judge and still runs a panel.
    const seeds = host.definition.steps.some((step) => step.provided !== undefined);
    const stands = host.definition.steps.every(
      (step) => typeof step.pipeline !== 'function' || step.provided !== undefined,
    );
    const normalized = this.admit(
      host,
      {
        ...(host.definition.takesTarget ? { pipeline: source.pipeline } : {}),
        goal: source.request.goal,
        maxIterations: source.request.maxIterations,
        ...(body.samples === undefined ? {} : { samples: body.samples }),
      },
      stands,
    );
    const provided = seeds ? source : null;
    const record = await this.open(host, normalized, provided);
    void this.perform(host, record, normalized, provided);
    return record;
  }

  private host(orchestrator: string): OrchestratorHost {
    return orNotFound(this.hosts.get(orchestrator), `unknown orchestrator ${orchestrator}`);
  }

  /**
   * The request as the orchestrator will see it, or the reason it will not.
   * The declaration decides whether a target is named at all; a named one
   * must be registered; the orchestrator's own `refuse` says the rest.
   */
  private admit(
    host: OrchestratorHost,
    request: StartOrchestrationRequest,
    stood = false,
  ): StartOrchestrationRequest {
    const normalized = host.definition.normalize?.(request) ?? request;
    assertTargetDeclared(host, normalized);
    // A named target must be registered — the same 404 a run would get.
    if (normalized.pipeline !== undefined) this.runs.summary(normalized.pipeline);
    const refusal = host.definition.refuse?.(normalized, this.runs.pipelines(), stood);
    if (refusal !== null && refusal !== undefined) throw new BadRequestException(refusal);
    return normalized;
  }

  private async open(
    host: OrchestratorHost,
    request: StartOrchestrationRequest,
    provided: QualityRunDto | null,
  ): Promise<OrchestrationRunDto> {
    const record = openRecord(
      host.definition,
      request,
      provided,
      await host.definition.context(host.ports),
      this.iterationBudget(request, provided),
      () => new Date().toISOString(),
    );
    await this.repository.open(record);
    return record;
  }

  /** The provided run's budget, else the request's, else the target pipeline's own, else the default. */
  private iterationBudget(
    request: StartOrchestrationRequest,
    provided: QualityRunDto | null,
  ): number {
    return (
      provided?.request.maxIterations ??
      request.maxIterations ??
      this.runs.summaryOf(request.pipeline)?.policy.loop.maxIterations ??
      DEFAULT_QUALITY_RUN_ITERATIONS
    );
  }

  private async perform(
    host: OrchestratorHost,
    record: OrchestrationRunDto,
    request: StartOrchestrationRequest,
    provided: QualityRunDto | null,
  ): Promise<void> {
    const label = `${host.definition.id} run ${record.orchestrationRunId}`;
    const ticker = heartbeatTicker(
      () => this.repository.heartbeat(record.orchestrationRunId),
      this.janitor.staleAfterMs,
      (error) => this.logger.warn(`${label}: heartbeat not written: ${String(error)}`),
    );
    try {
      await runOrchestration(host.definition, record, request, provided, {
        ports: host.ports,
        pipelines: () => this.runs.pipelines(),
        execute: (child, onOpened) => this.runs.execute(child, onOpened),
        flush: (current) => this.repository.update(current),
        now: () => new Date().toISOString(),
        warn: (message) => this.logger.warn(`${label}: ${message}`),
      });
    } finally {
      ticker.stop();
      try {
        const outcome = await this.repository.close(record);
        if (outcome === 'reclaimed') {
          this.logger.warn(
            `${label}: the janitor had failed this row as interrupted; overwrote it with the true outcome`,
          );
        } else if (outcome === 'refused') {
          this.logger.error(`${label}: not persisted: the row is already terminal`);
        }
      } catch (error) {
        this.logger.error(`${label}: not persisted: ${String(error)}`);
      }
      this.logger.log(`${label} ${record.status}`);
    }
  }
}

/** The declaration decides whether a target is named at all. */
function assertTargetDeclared(host: OrchestratorHost, request: StartOrchestrationRequest): void {
  const { id, takesTarget } = host.definition;
  if (takesTarget && request.pipeline === undefined) {
    throw new BadRequestException(`${id} takes a target pipeline; name one`);
  }
  if (!takesTarget && request.pipeline !== undefined) {
    throw new BadRequestException(`${id} chooses its own pipeline; do not name one`);
  }
}
