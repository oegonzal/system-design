/**
 * Injection tokens for the upstream side: the adapters, the ledger, the
 * budget and the gate (interfaces vanish at runtime, so Nest needs a value
 * to key each provider on). The clock lives here too — it is the one every
 * module shares.
 */
export const OPPORTUNITY_SEARCH = Symbol('OPPORTUNITY_SEARCH');
export const NOTICE_DESCRIPTIONS = Symbol('NOTICE_DESCRIPTIONS');
export const CONTRACT_AWARDS = Symbol('CONTRACT_AWARDS');
export const SPENDING_AWARDS = Symbol('SPENDING_AWARDS');
export const ENTITY_REGISTRY = Symbol('ENTITY_REGISTRY');
export const SOURCE_CALL_LOG = Symbol('SOURCE_CALL_LOG');
export const BUDGET_POLICY = Symbol('BUDGET_POLICY');
export const REQUEST_GATE = Symbol('REQUEST_GATE');
export const CLOCK = Symbol('CLOCK');
