/**
 * The ports the document-memory orchestrator runs over: the memory
 * orchestrator's embeddings and store, bound to the same adapters by the
 * orchestration module. No probes — a document is digested, never recalled
 * for — and no model of its own: the digest is a registered pipeline.
 */
import type { MemoryPorts } from '../memory/ports';

export type DocumentMemoryPorts = Pick<MemoryPorts, 'embedding' | 'embeddings' | 'store'>;
