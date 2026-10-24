/**
 * The orchestration module's ports. The record repository is MikroORM in
 * production; specs hand in fakes. A binding is a definition and the ports
 * it declared — bound by the module that owns those adapters, never here.
 */
import type { ListOrchestrationRunsQuery, OrchestrationRunDto } from '@sysdesign/contracts';

import type { CloseOutcome } from '../../core/ports';
import type { OrchestratorDefinition } from '../../orchestrators/runner/definition';

export interface OrchestratorBinding<O extends object = Record<string, unknown>, P = unknown> {
  definition: OrchestratorDefinition<O, P>;
  ports: P;
}

/** The list query after the HTTP edge applied its defaults. */
export type OrchestrationListQuery = ListOrchestrationRunsQuery & { limit: number; offset: number };

/** Where orchestration runs live between requests and across restarts. */
export interface OrchestrationRunRepository {
  open(record: OrchestrationRunDto): Promise<void>;
  /** Steps and child ids, flushed at every transition, refreshing the heartbeat; a terminal row is never written. */
  update(record: OrchestrationRunDto): Promise<void>;
  /** Refresh the running row's heartbeat: the process is still here. */
  heartbeat(orchestrationRunId: string): Promise<void>;
  /** The terminal write; a row the janitor failed as Interrupted is reclaimed with the truth. */
  close(record: OrchestrationRunDto): Promise<CloseOutcome>;
  find(orchestrationRunId: string): Promise<OrchestrationRunDto | null>;
  list(query: OrchestrationListQuery): Promise<[OrchestrationRunDto[], number]>;
  /**
   * Fail every `running` row whose heartbeat is older than `before` — unless
   * one of its child runs is still alive, which proves the orchestration is;
   * returns how many.
   */
  failStale(before: Date): Promise<number>;
}
