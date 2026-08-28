/**
 * The canvas graph — the wire shape of a design. Framework-agnostic on
 * purpose: React Flow's node/edge types never appear here; the UI keeps a
 * single mapping module (`graph-io`) that translates between the two.
 */

/**
 * Every building block the palette offers. The single source of the
 * vocabulary: the DTO validates against it (`@IsIn([...NODE_KINDS])`), the
 * eval engine's rules match on it, and the design system's color/icon tables
 * are `satisfies Record<NodeKind, ...>` — so adding a kind here refuses to
 * compile until every consumer has caught up.
 */
export const NODE_KINDS = [
  'client',
  'cdn',
  'dns',
  'gateway',
  'load-balancer',
  'service',
  'worker',
  'database',
  'replica',
  'cache',
  'queue',
  'event-stream',
  'object-store',
  'search-index',
  'scheduler',
  'external-api',
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Solid request/response call vs. fire-and-forget messaging. */
export const EDGE_KINDS = ['sync', 'async'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/**
 * Per-node knobs some eval rules read (`replicas`, `dlq`, `rateLimit`, …).
 * A flat scalar record rather than per-kind shapes: the canvas edits it
 * generically and rules read specific keys defensively.
 */
export type NodeConfig = Record<string, string | number | boolean>;

export interface CanvasNode {
  id: string;
  kind: NodeKind;
  label: string;
  config?: NodeConfig;
  /** Canvas layout, so a stored revision re-renders where the author left it. */
  position?: { x: number; y: number };
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  /** Defaults to `sync` when omitted. */
  kind?: EdgeKind;
  label?: string;
}

export interface CanvasGraph {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export const CANVAS_MAX_NODES = 100;
export const CANVAS_MAX_EDGES = 300;
export const CANVAS_ID_MAX_LENGTH = 64;
export const NODE_LABEL_MAX_LENGTH = 80;
export const EDGE_LABEL_MAX_LENGTH = 80;
