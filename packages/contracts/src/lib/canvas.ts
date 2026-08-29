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
  // ── Clients & Edge
  'client',
  'cdn',
  'dns',
  // ── Traffic & Routing
  'gateway',
  'load-balancer',
  /**
   * Terminates long-lived WebSocket/SSE connections for push traffic. Rule
   * hooks: presence for realtime/chat/live prompts; misuse: plain LB fanning
   * realtime out of a service with no connection tier; knobs maxConnections,
   * sticky
   */
  'websocket-gateway',
  /**
   * Sidecar layer for east-west traffic: mTLS, retries, discovery. Rule
   * hooks: presence in many-service graphs w/ security NFR; misuse: mesh in a
   * 2-service design (overengineering); knob mtls
   */
  'service-mesh',
  // ── Compute
  'service',
  'worker',
  /**
   * Event-triggered ephemeral compute (FaaS), scales to zero. Rule hooks:
   * presence for spiky/low-duty workloads; misuse: latency-critical sync path
   * (cold starts), unpooled DB connections at fan-out; knobs memoryMb,
   * timeoutSeconds, provisionedConcurrency
   */
  'serverless-function',
  /**
   * Scheduled/bulk offline processing (ETL, reports). Rule hooks: misuse:
   * reading the OLTP primary instead of replica/warehouse; no
   * scheduler/workflow-engine trigger; knobs schedule, idempotent
   */
  'batch-job',
  // ── Data Stores
  'database',
  'replica',
  'object-store',
  'search-index',
  /**
   * Key-value store for sessions, counters, simple lookups. Rule hooks:
   * presence: session state when services scale out; misuse: relational
   * workloads on KV, session data with no TTL; knobs replicas, consistency,
   * ttlSeconds
   */
  'kv-store',
  /**
   * Timestamped metrics/events store with retention/downsampling. Rule hooks:
   * presence for metrics/IoT prompts; misuse: high-rate time-series in the
   * OLTP database; knobs retentionDays, downsampling
   */
  'time-series-db',
  /**
   * Embedding store for similarity search (RAG, recommendations). Rule hooks:
   * presence for AI/semantic-search prompts; misuse: no embedding pipeline
   * feeding it; knobs dimensions, indexType
   */
  'vector-db',
  // ── Caching
  'cache',
  // ── Messaging & Streaming
  'queue',
  'event-stream',
  /**
   * Fan-out topic: one publish, N independent subscribers. Rule hooks:
   * presence for notification fan-out; misuse: single subscriber (a queue
   * would do), no DLQ path; knobs delivery, fanout
   */
  'pub-sub',
  /**
   * Change-data-capture / outbox relay: DB commits become stream events.
   * Rule hooks: presence: fixes dual-write when a service writes DB and
   * publishes events; misuse: no source database in-edge or no sink stream
   * out-edge; knob mode (log-based|outbox)
   */
  'cdc-connector',
  /**
   * Dispatches push/email/SMS via providers. Rule hooks: misuse: called
   * synchronously on the request path (belongs behind queue/pub-sub), no
   * retry/DLQ semantics; knobs channels, rateLimit
   */
  'notification-service',
  // ── Analytics & ML
  /**
   * Continuous computation over streams (aggregation, windowing). Rule
   * hooks: presence for realtime analytics; misuse: no inbound event-stream,
   * writing aggregates to the OLTP primary under load; knobs parallelism,
   * checkpointing
   */
  'stream-processor',
  /**
   * Columnar OLAP store for BI/reporting. Rule hooks: misuse: BI queries on
   * the OLTP database when a warehouse exists, warehouse fed synchronously
   * from request path; knob loadMode (batch|streaming)
   */
  'data-warehouse',
  /**
   * Schema-on-read storage of raw events for later processing. Rule hooks:
   * misuse: serving user-facing queries directly from the lake; knob format
   * (parquet|json|raw)
   */
  'data-lake',
  /**
   * Model-serving endpoint (recommendations, moderation, LLM). Rule hooks:
   * misuse: sync inference on the critical path with no timeout/fallback;
   * knobs replicas, gpu, timeoutMs, fallback
   */
  'ml-inference',
  // ── Coordination & Config
  'scheduler',
  // ── Identity & Security
  // ── Observability
  // ── External & SaaS
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
