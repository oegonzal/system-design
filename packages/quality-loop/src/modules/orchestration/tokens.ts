/** Injection tokens for the orchestration module's ports. */
export const ORCHESTRATION_RUN_REPOSITORY = Symbol('ORCHESTRATION_RUN_REPOSITORY');
/** `ReadonlyMap<orchestrator id, OrchestratorHost>` — every definition bound to the ports it runs over. */
export const ORCHESTRATOR_HOSTS = Symbol('ORCHESTRATOR_HOSTS');
