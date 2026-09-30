/** Injection tokens for the interfaces this module wires: interfaces vanish at runtime, so Nest keys each provider on a symbol. */
export const QUALITY_LOOP_LLM = Symbol('QUALITY_LOOP_LLM');
export const PIPELINES_TOKEN = Symbol('PIPELINES');
export const TRACE_STORE = Symbol('TRACE_STORE');
export const RUN_REPOSITORY = Symbol('RUN_REPOSITORY');
