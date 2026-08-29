/**
 * The canvas graph — the wire shape of a design. Framework-agnostic on
 * purpose: React Flow's node/edge types never appear here; the UI keeps a
 * single mapping module (`graph-io`) that translates between the two.
 */

/**
 * Every building block the palette offers. The single source of the
 * vocabulary: the DTO validates against it (`@IsIn([...NODE_KINDS])`), the
 * eval engine's rules match on it, the category map below is
 * `satisfies Record<NodeKind, NodeKindCategoryId>`, and the design system's
 * color/icon tables — including the per-category color table — are
 * `satisfies Record<NodeKind | NodeKindCategoryId, ...>` — so adding a kind
 * here refuses to compile until every consumer has caught up.
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

/**
 * The palette's shelving system. Categories are declared here — not in the
 * UI — so the palette's sections, the properties panel's optgroups and the
 * design system's per-category colors all read one ordering.
 *
 * Some categories are deliberately empty today (`analytics`, `security`,
 * `observability`): they exist ahead of the kinds that will fill them, and
 * every consumer must render "category with no kinds" as nothing rather
 * than assuming at least one member.
 */
export const NODE_KIND_CATEGORIES = [
  { id: 'clients-edge', label: 'Clients & Edge' },
  { id: 'traffic', label: 'Traffic & Routing' },
  { id: 'compute', label: 'Compute' },
  { id: 'data-stores', label: 'Data Stores' },
  { id: 'caching', label: 'Caching' },
  { id: 'messaging', label: 'Messaging & Streaming' },
  { id: 'analytics', label: 'Analytics & ML' },
  { id: 'coordination', label: 'Coordination & Config' },
  { id: 'security', label: 'Identity & Security' },
  { id: 'observability', label: 'Observability' },
  { id: 'external', label: 'External & SaaS' },
] as const;
export type NodeKindCategoryId = (typeof NODE_KIND_CATEGORIES)[number]['id'];

/**
 * Which shelf each kind sits on. `satisfies` both ways: a new kind fails to
 * compile until it is filed, and a typo'd category id is caught here rather
 * than surfacing as an empty section.
 */
export const NODE_KIND_CATEGORY = {
  client: 'clients-edge',
  cdn: 'clients-edge',
  dns: 'clients-edge',
  gateway: 'traffic',
  'load-balancer': 'traffic',
  service: 'compute',
  worker: 'compute',
  database: 'data-stores',
  replica: 'data-stores',
  'object-store': 'data-stores',
  'search-index': 'data-stores',
  cache: 'caching',
  queue: 'messaging',
  'event-stream': 'messaging',
  scheduler: 'coordination',
  'external-api': 'external',
} as const satisfies Record<NodeKind, NodeKindCategoryId>;

/** The kinds on one shelf, in `NODE_KINDS` order. */
export function kindsInCategory(id: NodeKindCategoryId): NodeKind[] {
  return NODE_KINDS.filter((kind) => NODE_KIND_CATEGORY[kind] === id);
}

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
