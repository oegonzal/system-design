/**
 * Injection token for the `LlmClient` interface — interfaces erase at runtime,
 * so DI needs a value. Kept in its own file, as the worker does, so importing
 * the token never drags in a service.
 */
export const LLM_CLIENT = Symbol('LLM_CLIENT');
