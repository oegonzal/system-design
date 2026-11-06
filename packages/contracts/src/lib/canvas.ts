/**
 * The diagram's notation: which blocks the palette offers, how they are
 * shelved, the two kinds of connection and the four kinds of operation, plus
 * the size limits every side enforces. A block is a generic role; a
 * platform's managed service (`platforms/`) names the roles it may play, so
 * a node drawn as one keeps a role here as its kind. The vocabulary spans the whole of a
 * software design, from the people and modules of an application to the
 * infrastructure under it; nothing here grades a design — the vocabulary is
 * what the author draws with, and the quality loop's lenses judge whatever
 * they drew. The shapes themselves are the zod schema in `canvas.schema.ts`.
 */
import { bound } from './bounds';

/**
 * Every building block the palette offers. The single source of the
 * vocabulary: the submission schema enum-locks to it, the category map below
 * is `satisfies Record<NodeKind, NodeKindCategoryId>`, and the design system's
 * color/icon tables are `satisfies Record<NodeKind | NodeKindCategoryId, …>` —
 * so adding a kind here refuses to compile until every consumer has caught up.
 */
export const NODE_KINDS = [
  // ── Application
  'actor',
  'module',
  // ── Clients & Edge
  'client',
  'cdn',
  'dns',
  'static-site-host',
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
  'file-store',
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
  'query-engine',
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
  'certificate-manager',
  'authorization-service',
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
  { id: 'application', label: 'Application' },
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
  actor: 'application',
  module: 'application',
  client: 'clients-edge',
  cdn: 'clients-edge',
  dns: 'clients-edge',
  'static-site-host': 'clients-edge',
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
  'file-store': 'data-stores',
  cache: 'caching',
  queue: 'messaging',
  'event-stream': 'messaging',
  'pub-sub': 'messaging',
  'cdc-connector': 'messaging',
  'notification-service': 'messaging',
  'stream-processor': 'analytics',
  'data-warehouse': 'analytics',
  'data-lake': 'analytics',
  'query-engine': 'analytics',
  'ml-inference': 'analytics',
  scheduler: 'coordination',
  'workflow-engine': 'coordination',
  'distributed-lock': 'coordination',
  'id-generator': 'coordination',
  'config-service': 'coordination',
  'auth-service': 'security',
  'secrets-manager': 'security',
  waf: 'security',
  'certificate-manager': 'security',
  'authorization-service': 'security',
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

/**
 * What each block is called before the author renames it: the palette's
 * caption, the name a dropped node starts with, and the stand-in wherever a
 * label is blank. Total over `NodeKind` by `satisfies`, so every kind has a
 * name and no reader has to invent one.
 */
export const DEFAULT_NODE_LABELS = {
  actor: 'Actor',
  module: 'Module',
  client: 'Client',
  cdn: 'CDN',
  dns: 'DNS',
  'static-site-host': 'Static Web Host',
  gateway: 'API Gateway',
  'load-balancer': 'Load Balancer',
  'websocket-gateway': 'Realtime Gateway',
  'service-mesh': 'Service Mesh',
  service: 'Service',
  worker: 'Worker',
  'serverless-function': 'Serverless Function',
  'batch-job': 'Batch Job',
  database: 'Database',
  replica: 'Read Replica',
  'object-store': 'Object Store',
  'search-index': 'Search Index',
  'kv-store': 'KV Store',
  'time-series-db': 'Time-Series DB',
  'vector-db': 'Vector DB',
  'file-store': 'File Store',
  cache: 'Cache',
  queue: 'Queue',
  'event-stream': 'Event Stream',
  'pub-sub': 'Pub/Sub Topic',
  'cdc-connector': 'CDC Connector',
  'notification-service': 'Notification Service',
  'stream-processor': 'Stream Processor',
  'data-warehouse': 'Data Warehouse',
  'data-lake': 'Data Lake',
  'query-engine': 'Query Engine',
  'ml-inference': 'ML Inference',
  scheduler: 'Scheduler',
  'workflow-engine': 'Workflow Engine',
  'distributed-lock': 'Distributed Lock',
  'id-generator': 'ID Generator',
  'config-service': 'Config & Flags',
  'auth-service': 'Auth Service',
  'secrets-manager': 'Secrets Manager',
  waf: 'WAF',
  'certificate-manager': 'Certificate Manager',
  'authorization-service': 'Authorization Service',
  monitoring: 'Monitoring',
  logging: 'Log Aggregation',
  tracing: 'Tracing',
  'external-api': 'External API',
  'payment-provider': 'Payment Provider',
} as const satisfies Record<NodeKind, string>;

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

/*
 * Every bound below is one the coach writes into, declared once as a target
 * and a ceiling (`bound`): the model is asked for the target, the schema
 * accepts the ceiling without a word, and the parse keeps what runs past it —
 * nothing is cut to fit, and nothing a little over is refused. Each target
 * sits at or above the 99th percentile the coach has measurably written and
 * each ceiling above the longest (`measured/canvas.json`, which
 * `pnpm measure:bounds` refreshes and `canvas.schema.spec.ts` holds them to),
 * and the editors enforce the same declarations as `maxLength`. Ids are
 * exact: a wrong one is a fault.
 */
export const CANVAS_NODES_BOUND = bound(100, 'list');
export const CANVAS_EDGES_BOUND = bound(300, 'list');
export const CANVAS_ID_MAX_LENGTH = 64;
export const NODE_LABEL_BOUND = bound(80);
export const EDGE_LABEL_BOUND = bound(80);

export const NODE_RESPONSIBILITIES_BOUND = bound(6, 'list');
/** Measured 2026-10-13 over the coach's canvases: p99 124, max 137 — a clause, not a sentence. */
export const RESPONSIBILITY_BOUND = bound(150);
export const NODE_OPERATIONS_BOUND = bound(12, 'list');
export const OPERATION_NAME_MAX_LENGTH = 60;
export const OPERATION_NOTES_BOUND = bound(200);
export const EDGE_CARRIES_BOUND = bound(8, 'list');
/** Whole-graph operation budget, enforced by the graph validator. */
export const CANVAS_MAX_TOTAL_OPERATIONS = 400;

/** A node's config entries; an edge's are bounded apart — a hop declares less than a component does. */
export const NODE_CONFIG_KEYS_BOUND = bound(20, 'list');
export const EDGE_CONFIG_KEYS_BOUND = bound(10, 'list');
/** One config entry, on a node or an edge: the key is exact, the value's text bounded. */
export const CONFIG_KEY_MAX_LENGTH = 40;
export const CONFIG_STRING_VALUE_BOUND = bound(120);
/**
 * The keys a connection's config is offered as suggestions: how a hop is made
 * and what happens when it fails. Suggestions only — any key is accepted, as
 * on a node (UX-9). The panel offers them; the request lifecycle names two of
 * them (`tls`, `auth`) as the hop facts that serve a stage of the way in, and
 * reads those by key wherever a path is traced.
 */
export const EDGE_CONFIG_HINTS = [
  'protocol',
  'auth',
  'tls',
  'timeoutMs',
  'retries',
  'dlq',
  'delivery',
  'ordering',
  'batchSize',
  'idempotencyKey',
] as const;

export const BRIEF_BINDINGS_BOUND = bound(24, 'list');
export const BINDING_NODES_BOUND = bound(12, 'list');
export const FLOW_STEPS_BOUND = bound(24, 'list');
export const BINDING_CLAIM_BOUND = bound(360);
/** Why this mechanism and not another: the alternative considered and the cost of the choice. */
export const BINDING_TRADEOFF_BOUND = bound(360);

export const NARRATION_PROSE_BOUND = bound(720);
export const NARRATION_OVERVIEW_BOUND = bound(1500);
export const NARRATION_COMPONENT_RATIONALES_BOUND = bound(40, 'list');
export const NARRATION_CRITERION_NARRATIONS_BOUND = bound(24, 'list');
/** The decisions a design rests on: each a choice, the alternative, the cost, and what would change it. */
export const NARRATIVE_DECISIONS_BOUND = bound(12, 'list');
export const DECISION_TEXT_BOUND = bound(360);
export const DECISION_NODES_BOUND = bound(6, 'list');
/** The assumptions the design depends on, each one sentence, stated rather than smuggled into a claim. */
export const NARRATIVE_ASSUMPTIONS_BOUND = bound(12, 'list');
export const ASSUMPTION_BOUND = bound(240);
/** The data model: the entities the design keeps and how they relate. */
export const MODEL_ENTITIES_BOUND = bound(30, 'list');
export const MODEL_RELATIONS_BOUND = bound(40, 'list');
export const ENTITY_NAME_BOUND = bound(60);
export const ENTITY_NOTE_BOUND = bound(200);
export const ENTITY_FIELDS_BOUND = bound(16, 'list');
export const ENTITY_INVARIANTS_BOUND = bound(8, 'list');
export const ENTITY_STATES_BOUND = bound(10, 'list');
/** The entities a binding names as holding a requirement, beside the nodes. */
export const BINDING_ENTITIES_BOUND = bound(8, 'list');
