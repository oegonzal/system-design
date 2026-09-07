/**
 * Injection tokens for the memory module's ports (interfaces vanish at
 * runtime, so Nest needs a value to key each provider on).
 */
export const EMBEDDING_CLIENT = Symbol('EMBEDDING_CLIENT');
export const EMBEDDING_CACHE = Symbol('EMBEDDING_CACHE');
export const MEMORY_STORE = Symbol('MEMORY_STORE');
export const MEMORY_RUN_REPOSITORY = Symbol('MEMORY_RUN_REPOSITORY');
export const MEMORY_PIPELINES = Symbol('MEMORY_PIPELINES');
