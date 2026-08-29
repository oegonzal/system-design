/**
 * Injection token for the LlmClient interface (interfaces vanish at runtime,
 * so Nest needs a value to key the provider on). The environment decides once,
 * at boot, whether the real client or the no-op backs it.
 */
export const LLM_CLIENT = Symbol('LLM_CLIENT');
