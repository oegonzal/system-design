/**
 * The runtime's fakes, for a host's specs: in-memory stores that hold the
 * same contract as Postgres and Qdrant, a table-driven embedder, and the
 * fixtures. Never imported by production code.
 */
export { InMemoryRecordStore } from './in-memory-record-store';
export { InMemoryVectorIndex } from './in-memory-vector-index';
export { InMemorySpaceStore, tableEmbedder } from './fakes';
export { GOLDEN_STRATEGY, strategyFixture, TEST_POLICY } from './fixtures';
