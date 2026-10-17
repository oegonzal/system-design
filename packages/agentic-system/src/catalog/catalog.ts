/**
 * The agentic-memory layer catalog: the components a memory architecture is
 * drawn from, each as declared data — the layer it fills, the API/interface a
 * design talks to it through, what it contributes to the system, the operations
 * an edge to it carries, and — for a store — the memory types it serves. This
 * is reference data for the author and the coach, not a grading rule: it seeds
 * the design brief and lets a component state its interface. Naming vendors here
 * is the catalog's job; the engine's lenses (in quality-loop) name none.
 */
import type { OperationKind, RegisterKind } from '@sysdesign/contracts';

/** The layers of the architecture, from the application surface down to the stores. */
export const MEMORY_LAYERS = [
  'frontend',
  'backend',
  'agent-runtime',
  'orchestration',
  'memory-service',
  'tool-integration',
  'browser-automation',
  'structured-state',
  'vector-search',
  'knowledge-graph',
  'object-store',
  'cache',
  'background-jobs',
  'observability',
] as const;
export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

/** One operation a component exposes, in the shared operation-kind vocabulary. */
export interface CatalogOperation {
  name: string;
  kind: OperationKind;
  idempotent?: boolean;
  notes: string;
}

/** One component a memory architecture may use, mapped to what it does. */
export interface CatalogComponent {
  /** Stable id — `qdrant`, `pgvector`. */
  id: string;
  label: string;
  layer: MemoryLayer;
  /** How a design talks to it — the shape of its API/interface. */
  apiInterface: string;
  /** What it contributes to the agentic memory system. */
  contributes: string;
  /** The operations this component declares — names an edge's `carries` may reference. */
  operations: readonly CatalogOperation[];
  /** For a store, the memory types (the strategy's register kinds) it serves; omitted on a component that stores no memory. */
  memoryTypes?: readonly RegisterKind[];
  /** Other components that fill the same layer, for the author weighing a choice. */
  alternatives?: readonly string[];
}

/** A cross-cutting control with no node of its own — advisory, not a drawn component. */
export interface CrossCuttingControl {
  id: string;
  label: string;
  concern: string;
  contributes: string;
}
