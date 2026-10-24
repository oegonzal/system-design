/** Injection tokens for the orchestration module's ports. */
export const ORCHESTRATION_RUN_REPOSITORY = Symbol('ORCHESTRATION_RUN_REPOSITORY');
/** `ReadonlyMap<orchestrator id, OrchestratorBinding>` — every definition bound to the ports it runs over. */
export const ORCHESTRATOR_BINDINGS = Symbol('ORCHESTRATOR_BINDINGS');
