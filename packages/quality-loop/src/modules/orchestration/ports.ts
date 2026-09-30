/**
 * The orchestration module's ports. The record repository is MikroORM in
 * production; specs hand in fakes. A host is a definition bound to the ports
 * it declared — bound by the module that owns those adapters, never here.
 */
import type { ListOrchestrationRunsQuery, OrchestrationRunDto } from '@sysdesign/contracts';

import type { OrchestratorDefinition } from '../../orchestrators/runner/definition';

export interface OrchestratorHost<O extends object = Record<string, unknown>, P = unknown> {
  definition: OrchestratorDefinition<O, P>;
  ports: P;
}

/** The list query after the HTTP edge applied its defaults. */
export type OrchestrationListQuery = ListOrchestrationRunsQuery & { limit: number; offset: number };

/** Where orchestration runs live between requests and across restarts. */
export interface OrchestrationRunRepository {
  open(record: OrchestrationRunDto): Promise<void>;
  /** Steps and child ids, flushed at every transition; a swept row is never resurrected. */
  update(record: OrchestrationRunDto): Promise<void>;
  close(record: OrchestrationRunDto): Promise<void>;
  find(orchestrationRunId: string): Promise<OrchestrationRunDto | null>;
  list(query: OrchestrationListQuery): Promise<[OrchestrationRunDto[], number]>;
  /** Rows still `running` from a previous process are failed; returns how many. */
  failInterrupted(): Promise<number>;
}
