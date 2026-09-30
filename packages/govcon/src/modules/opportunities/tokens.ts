/**
 * Injection tokens for the interfaces this module wires (interfaces vanish at
 * runtime, so Nest needs a value to key each provider on).
 */
export const OPPORTUNITY_SEARCH = Symbol('OPPORTUNITY_SEARCH');
export const NOTICE_DESCRIPTIONS = Symbol('NOTICE_DESCRIPTIONS');
export const SOURCE_CALL_LOG = Symbol('SOURCE_CALL_LOG');
export const OPPORTUNITY_REPOSITORY = Symbol('OPPORTUNITY_REPOSITORY');
export const SEARCH_PROFILES = Symbol('SEARCH_PROFILES');
export const BUDGET_POLICY = Symbol('BUDGET_POLICY');
export const REQUEST_GATE = Symbol('REQUEST_GATE');
export const CLOCK = Symbol('CLOCK');
