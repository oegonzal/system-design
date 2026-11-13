/**
 * `@sysdesign/agentic-memory`: a memory strategy executed. A host builds the
 * ports — the Postgres stores, a vector index, the embedder it owns, a clock —
 * and serves the `MemoryService` over them; nothing here reads the
 * environment, constructs a model client or keeps time.
 */
export { MemoryService } from './service/memory-service';
export { MemoryRefused } from './refusal';
export { memoryPolicySchema, type MemoryPolicy } from './space/policy';
export type { SweepReport } from './lifecycle/sweep';
export type { Embedder, MemoryPorts, VectorIndex } from './ports';
export { MikroOrmRecordStore } from './adapters/mikro-orm/mikro-orm-record-store';
export { MikroOrmSpaceStore } from './adapters/mikro-orm/mikro-orm-space-store';
export { PgvectorVectorIndex } from './adapters/pgvector/pgvector-vector-index';
