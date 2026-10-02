/** Injection tokens for the interfaces this module wires: interfaces vanish at runtime, so Nest keys each provider on a symbol. */
export const QUALITY_LOOP_LLM = Symbol('QUALITY_LOOP_LLM');
export const PIPELINES_TOKEN = Symbol('PIPELINES');
export const TRACE_STORE = Symbol('TRACE_STORE');
export const RUN_REPOSITORY = Symbol('RUN_REPOSITORY');
/** Where run dumps are written and read — one value, so reader and writer cannot drift. */
export const RUN_DUMP_DIR = Symbol('RUN_DUMP_DIR');
/** The slot a module that can recall binds itself into — see `recall/run-recall.ts`. */
export const RUN_RECALL_SLOT = Symbol('RUN_RECALL_SLOT');
/** Where a run's recall is recorded — the runs module's own port, kept out of the core's `RunRepository`. */
export const RUN_RECALL_RECORDER = Symbol('RUN_RECALL_RECORDER');
