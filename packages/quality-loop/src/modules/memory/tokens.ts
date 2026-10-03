/** Injection tokens for the memory module's ports: interfaces vanish at runtime, so Nest keys each provider on a symbol. */
export const EMBEDDING_CLIENT = Symbol('EMBEDDING_CLIENT');
export const EMBEDDING_CACHE = Symbol('EMBEDDING_CACHE');
export const MEMORY_STORE = Symbol('MEMORY_STORE');
export const QUERY_PROBES = Symbol('QUERY_PROBES');
/** The four bound together, as the memory orchestrator's steps consume them. */
export const MEMORY_PORTS = Symbol('MEMORY_PORTS');
/** Where a run's claims about another run's stored items are recorded. */
export const MEMORY_SUPPORT = Symbol('MEMORY_SUPPORT');
/**
 * The knowledge orchestrator's ports: the same embeddings and store the memory
 * orchestrator uses, plus the support store. A token of its own because
 * `support` is not part of `MemoryPorts` — widening that would reach every fake
 * of it in the tree for the sake of one orchestrator.
 */
export const KNOWLEDGE_PORTS = Symbol('KNOWLEDGE_PORTS');
