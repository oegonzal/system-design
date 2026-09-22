/**
 * Injection tokens for the router module's ports (interfaces vanish at
 * runtime, so Nest needs a value to key each provider on).
 */
export const BRIEF_CLASSIFIER = Symbol('BRIEF_CLASSIFIER');
/** The classifier and its availability, as the router orchestrator's steps consume them. */
export const ROUTER_PORTS = Symbol('ROUTER_PORTS');
