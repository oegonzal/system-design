/** Injection tokens for the memory module's ports: interfaces vanish at runtime, so Nest keys each provider on a symbol. */
export const EMBEDDING_CLIENT = Symbol('EMBEDDING_CLIENT');
export const EMBEDDING_CACHE = Symbol('EMBEDDING_CACHE');
export const MEMORY_STORE = Symbol('MEMORY_STORE');
export const QUERY_PROBES = Symbol('QUERY_PROBES');
/** The four bound together, as the memory orchestrator's steps consume them. */
export const MEMORY_PORTS = Symbol('MEMORY_PORTS');
