/**
 * The diagram's notation: which blocks the palette offers, how they are
 * shelved, the two kinds of connection and the four kinds of operation, plus
 * the size limits every side enforces. Nothing here grades a design — the
 * vocabulary is what the author draws with, and the quality loop's lenses
 * judge whatever they drew. The shapes themselves are the zod schema in
 * `canvas.schema.ts`.
 */

/**
 * Every building block the palette offers. The single source of the
 * vocabulary: the submission schema enum-locks to it, the category map below
 * is `satisfies Record<NodeKind, NodeKindCategoryId>`, and the design system's
 * color/icon tables are `satisfies Record<NodeKind | NodeKindCategoryId, …>` —
 * so adding a kind here refuses to compile until every consumer has caught up.
 */
export const NODE_KINDS = [
  // ── Clients & Edge
  'client',
  'cdn',
  'dns',
  // ── Traffic & Routing
  'gateway',
  'load-balancer',
  'websocket-gateway',
  'service-mesh',
  // ── Compute
  'service',
  'worker',
  'serverless-function',
  'batch-job',
  // ── Data Stores
  'database',
  'replica',
  'object-store',
  'search-index',
  'kv-store',
  'time-series-db',
  'vector-db',
  // ── Caching
  'cache',
  // ── Messaging & Streaming
  'queue',
  'event-stream',
  'pub-sub',
  'cdc-connector',
  'notification-service',
  // ── Analytics & ML
  'stream-processor',
  'data-warehouse',
  'data-lake',
  'ml-inference',
  // ── Coordination & Config
  'scheduler',
  'workflow-engine',
  'distributed-lock',
  'id-generator',
  'config-service',
  // ── Identity & Security
  'auth-service',
  'secrets-manager',
  'waf',
  // ── Observability
  'monitoring',
  'logging',
  'tracing',
  // ── External & SaaS
  'external-api',
  'payment-provider',
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

/**
 * The palette's shelving system. Categories are declared here — not in the
 * UI — so the palette's sections, the properties panel's optgroups and the
 * design system's per-category colors all read one ordering.
 *
 * Every category holds at least one kind (`canvas.spec` asserts it), but a
 * category may again be declared ahead of its members, so every consumer
 * must still render "category with no kinds" as nothing.
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
  'websocket-gateway': 'traffic',
  'service-mesh': 'traffic',
  service: 'compute',
  worker: 'compute',
  'serverless-function': 'compute',
  'batch-job': 'compute',
  database: 'data-stores',
  replica: 'data-stores',
  'object-store': 'data-stores',
  'search-index': 'data-stores',
  'kv-store': 'data-stores',
  'time-series-db': 'data-stores',
  'vector-db': 'data-stores',
  cache: 'caching',
  queue: 'messaging',
  'event-stream': 'messaging',
  'pub-sub': 'messaging',
  'cdc-connector': 'messaging',
  'notification-service': 'messaging',
  'stream-processor': 'analytics',
  'data-warehouse': 'analytics',
  'data-lake': 'analytics',
  'ml-inference': 'analytics',
  scheduler: 'coordination',
  'workflow-engine': 'coordination',
  'distributed-lock': 'coordination',
  'id-generator': 'coordination',
  'config-service': 'coordination',
  'auth-service': 'security',
  'secrets-manager': 'security',
  waf: 'security',
  monitoring: 'observability',
  logging: 'observability',
  tracing: 'observability',
  'external-api': 'external',
  'payment-provider': 'external',
} as const satisfies Record<NodeKind, NodeKindCategoryId>;

/** The kinds on one shelf, in `NODE_KINDS` order. */
export function kindsInCategory(id: NodeKindCategoryId): NodeKind[] {
  return NODE_KINDS.filter((kind) => NODE_KIND_CATEGORY[kind] === id);
}

/** Solid request/response call vs. fire-and-forget messaging. */
export const EDGE_KINDS = ['sync', 'async'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/**
 * The verb an operation exposes. `command` mutates, `query` reads,
 * `event` is a fact published after something happened, `stream` is a
 * continuous flow (subscription, tail, changefeed).
 */
export const OPERATION_KINDS = ['command', 'query', 'event', 'stream'] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export const CANVAS_MAX_NODES = 100;
export const CANVAS_MAX_EDGES = 300;
export const CANVAS_ID_MAX_LENGTH = 64;
export const NODE_LABEL_MAX_LENGTH = 80;
export const EDGE_LABEL_MAX_LENGTH = 80;

export const NODE_MAX_RESPONSIBILITIES = 6;
export const RESPONSIBILITY_MAX_LENGTH = 60;
export const NODE_MAX_OPERATIONS = 12;
export const OPERATION_NAME_MAX_LENGTH = 60;
export const OPERATION_NOTES_MAX_LENGTH = 140;
export const EDGE_MAX_CARRIES = 8;
/** Whole-graph operation budget, enforced by the graph validator. */
export const CANVAS_MAX_TOTAL_OPERATIONS = 400;

export const NODE_CONFIG_MAX_KEYS = 20;
export const NODE_CONFIG_KEY_MAX_LENGTH = 40;
export const NODE_CONFIG_STRING_VALUE_MAX_LENGTH = 120;

export const BRIEF_MAX_BINDINGS = 24;
export const BINDING_MAX_NODES = 12;
export const FLOW_MAX_STEPS = 24;
export const BINDING_CLAIM_MAX_LENGTH = 200;

export const NARRATION_PROSE_MAX_LENGTH = 600;
export const NARRATION_OVERVIEW_MAX_LENGTH = 1200;
export const NARRATION_MAX_COMPONENT_RATIONALES = 40;
export const NARRATION_MAX_CRITERION_NARRATIONS = 24;
