/**
 * Injection tokens for the interfaces this module wires (interfaces vanish at
 * runtime, so Nest needs a value to key each provider on).
 */
export const OPPORTUNITY_SOURCE = Symbol('OPPORTUNITY_SOURCE');
export const SOURCE_CALL_LOG = Symbol('SOURCE_CALL_LOG');
export const OPPORTUNITY_REPOSITORY = Symbol('OPPORTUNITY_REPOSITORY');
export const SEARCH_PROFILES = Symbol('SEARCH_PROFILES');
export const BUDGET_POLICY = Symbol('BUDGET_POLICY');
export const CLOCK = Symbol('CLOCK');
