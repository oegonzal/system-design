/**
 * Injection token for the `LlmClient` interface — interfaces erase at runtime,
 * so DI needs a value. Kept in its own file, as the worker does, so importing
 * the token never drags in a service.
 */
export const LLM_CLIENT = Symbol('LLM_CLIENT');

/**
 * The assistive client: the brief and interface suggesters. They propose and
 * a human accepts — nothing they return reaches a grade — so they share the
 * coach's determinism switch and auth route (`IMPROVER_DETERMINISTIC`,
 * `IMPROVER_AUTH=claude-code`) rather than the key-only client prompt
 * enrichment keeps: a subscription round-trip is fine behind a button the
 * author pressed, and would not be on every prompt generation.
 */
export const SUGGESTION_LLM = Symbol('SUGGESTION_LLM');
