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
import { bound, exact } from './bounds';
import { CANVAS_MAX_CRITERIA } from './studio-pipelines';

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
  'private-endpoint',
  'network-hub',
  'service-discovery',
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
  'backup-service',
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
  // ── Build & Deploy
  'code-repository',
  'build-service',
  'deployment-pipeline',
  'deployment-service',
  'artifact-registry',
  'infrastructure-as-code',
  // ── Identity & Security
  'auth-service',
  'secrets-manager',
  'waf',
  'certificate-manager',
  'authorization-service',
  'compliance-service',
  'threat-detection',
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
  { id: 'delivery', label: 'Build & Deploy' },
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
  'private-endpoint': 'traffic',
  'network-hub': 'traffic',
  'service-discovery': 'traffic',
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
  'backup-service': 'data-stores',
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
  'code-repository': 'delivery',
  'build-service': 'delivery',
  'deployment-pipeline': 'delivery',
  'deployment-service': 'delivery',
  'artifact-registry': 'delivery',
  'infrastructure-as-code': 'delivery',
  'auth-service': 'security',
  'secrets-manager': 'security',
  waf: 'security',
  'certificate-manager': 'security',
  'authorization-service': 'security',
  'compliance-service': 'security',
  'threat-detection': 'security',
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
  'private-endpoint': 'Private Endpoint',
  'network-hub': 'Network Hub',
  'service-discovery': 'Service Discovery',
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
  'backup-service': 'Backup Service',
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
  'code-repository': 'Code Repository',
  'build-service': 'Build Service',
  'deployment-pipeline': 'Deployment Pipeline',
  'deployment-service': 'Deployment Service',
  'artifact-registry': 'Artifact Registry',
  'infrastructure-as-code': 'Infrastructure as Code',
  'auth-service': 'Auth Service',
  'secrets-manager': 'Secrets Manager',
  waf: 'WAF',
  'certificate-manager': 'Certificate Manager',
  'authorization-service': 'Authorization Service',
  'compliance-service': 'Compliance Monitor',
  'threat-detection': 'Threat Detection',
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
 * each ceiling above the longest, over the window `measured/canvas.json`
 * holds: the 3 coach redraws of 2026-11-06T22:33:26Z…2026-11-07T00:32:46Z,
 * the first after the coach's effort was capped (66ff7ea8) — an earlier
 * window would hold the producer to the thinking that change removed.
 * `pnpm measure:bounds --pipeline=system-design-canvas
 * --since=2026-11-06T22:33:00Z --runs-dir=<the dumps of those runs>`
 * refreshes the fixture, `canvas.schema.spec.ts` holds every bound to it,
 * and the editors enforce the same declarations as `maxLength`. A list the
 * coach fills one entry per criterion is sized by the pipeline's criteria
 * cap, by policy — `exact`, held by no measurement. Ids are exact too: a
 * wrong one is a fault.
 */
export const CANVAS_NODES_BOUND = bound(100, 'list');
export const CANVAS_EDGES_BOUND = bound(300, 'list');
/*
 * The change set a revise returns (`canvas-change.schema.ts`) is sized to
 * one round's change, never to the whole canvas. Measured over chain 4's
 * rounds (session 2681e7b0, read 2026-11-07): a round changed or added 6–19
 * nodes and 12–42 edges, and removed 0–4. Generous past that on purpose: a
 * list past its ceiling is trimmed by whole items, and an item trimmed here
 * is a remediation that never reaches the artifact. `canvas.schema.spec.ts`
 * holds these to nothing until the first recorded change sets (none as of 2026-11-08).
 */
export const CHANGE_NODE_UPSERTS_BOUND = bound(24, 'list');
export const CHANGE_EDGE_UPSERTS_BOUND = bound(48, 'list');
/** One bound for the node removals and the edge removals of a change set. */
export const CHANGE_REMOVALS_BOUND = bound(24, 'list');
export const CANVAS_ID_MAX_LENGTH = 64;
export const NODE_LABEL_BOUND = bound(80);
/** Where a block sits — a region, an account, a network, a subnet, a security group — as the goal's platform names them. */
export const NODE_BOUNDARY_BOUND = bound(120);
export const EDGE_LABEL_BOUND = bound(80);

export const NODE_RESPONSIBILITIES_BOUND = bound(6, 'list');
/**
 * Measured 2026-10-13 over the coach's canvases: p99 124, max 137 — a clause,
 * not a sentence. That stays the last measurement: in the window above no
 * coach redraw wrote a responsibility (0 of 214 nodes; the coach states a
 * block's role as its operations and config), so the author's editor is the
 * one writer, and `canvas.schema.spec.ts` exempts the path until a coach
 * writes one.
 */
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
/** One bound for a node's and a hop's values. Measured in the window above: node values p99 157, max 215 (536 written); hop values p99 121, max 180 (944 written). */
export const CONFIG_STRING_VALUE_BOUND = bound(200);
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

/** One binding per criterion (the brief validator refuses a criterion bound twice), so the count is the pipeline's criteria cap. */
export const BRIEF_BINDINGS_BOUND = exact(CANVAS_MAX_CRITERIA);
/** A binding may name every component the canvas may hold. */
export const BINDING_NODES_BOUND = CANVAS_NODES_BOUND;
export const FLOW_STEPS_BOUND = bound(24, 'list');
/** Measured in the window above: p99 558, max 593 (127 claims). */
export const BINDING_CLAIM_BOUND = bound(600);
/** Why this mechanism and not another: the alternative considered and the cost of the choice. */
export const BINDING_TRADEOFF_BOUND = bound(360);

export const NARRATION_PROSE_BOUND = bound(720);
/** Measured in the window above: p99 1,649, max 1,649 (5 overviews). */
export const NARRATION_OVERVIEW_BOUND = bound(1700);
/** The rationales may name every component the canvas may hold. */
export const NARRATION_COMPONENT_RATIONALES_BOUND = CANVAS_NODES_BOUND;
/** One narration per criterion (the repair keeps the first), so the count is the pipeline's criteria cap. */
export const NARRATION_CRITERION_NARRATIONS_BOUND = exact(CANVAS_MAX_CRITERIA);
/**
 * The decisions a design rests on: each a choice, the alternative, the cost,
 * and what would change it. Measured in the window above: p99 18, max 18 (5 lists).
 */
export const NARRATIVE_DECISIONS_BOUND = bound(20, 'list');
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
