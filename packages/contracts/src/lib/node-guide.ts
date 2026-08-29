import { INTERFACE_CAPABILITIES } from './interfaces';
import type { NodeKind, OperationKind } from './canvas';

/**
 * The in-app teaching guide: what each block kind is and when to reach for
 * it. Shown in the properties panel when a block is selected and as the
 * palette hover text — the product explains its own vocabulary instead of
 * assuming it. Interface facts are deliberately NOT here: derive them with
 * `interfaceSummary`, which reads `INTERFACE_CAPABILITIES` so the two can
 * never disagree.
 */
export interface NodeKindGuide {
  /** What the block is, present tense, one sentence. */
  what: string;
  /** The signal that a design needs one. */
  whenToUse: string;
}

export const NODE_KIND_GUIDE = {
  // ── Clients & Edge
  client: {
    what: 'The people and devices using the system — browsers, apps, other services. Every request path starts here.',
    whenToUse: 'Start every design with one, so what users can actually reach is traceable.',
  },
  cdn: {
    what: 'Edge caches that serve static and cacheable content from locations near users, keeping that traffic off your origin.',
    whenToUse:
      'Media, images, bundles, seat maps — anything read-heavy and shared belongs in front of the origin.',
  },
  dns: {
    what: 'Name resolution and traffic steering at the very front — the first hop before any of your infrastructure.',
    whenToUse:
      'Multi-region designs steering users to the nearest healthy region, or failing over between regions.',
  },
  // ── Traffic & Routing
  gateway: {
    what: "The system's front door for API calls: authentication, rate limiting, admission control and routing in one place.",
    whenToUse:
      'Any internet-facing design — spikes and abusive clients should be shed here, not deep in the stack.',
  },
  'load-balancer': {
    what: 'Spreads incoming requests across identical instances so no single machine becomes the choke point.',
    whenToUse:
      "In front of any horizontally scaled tier — a service can't earn its replica count without one.",
  },
  'websocket-gateway': {
    what: 'Terminates long-lived WebSocket/SSE connections and pushes updates to subscribed clients.',
    whenToUse:
      'Live dashboards, chat, presence — anywhere the server pushes instead of clients polling.',
  },
  'service-mesh': {
    what: 'A sidecar layer for service-to-service traffic: mutual TLS, retries, timeouts and discovery without app code.',
    whenToUse:
      'Many services with strict security or reliability needs — overkill for a two-service design.',
  },
  // ── Compute
  service: {
    what: 'One stateless microservice: a single-purpose API tier that scales horizontally by adding replicas.',
    whenToUse:
      'Each distinct business capability gets its own — declare its commands and queries to be graded on the contract.',
  },
  worker: {
    what: 'Background compute that drains queues and does the slow or retryable work off the request path.',
    whenToUse:
      "Whatever a user shouldn't wait for: fulfilment, transcoding, webhooks — make it idempotent for replays.",
  },
  'serverless-function': {
    what: 'Event-triggered ephemeral compute that scales to zero between bursts — you pay per invocation.',
    whenToUse: 'Spiky, short-lived jobs; avoid latency-critical sync paths where cold starts hurt.',
  },
  'batch-job': {
    what: 'Scheduled bulk processing — ETL, reports, backfills — that runs on a timer, not per request.',
    whenToUse:
      'Heavy periodic work; read from a replica or warehouse so it never bogs down the primary.',
  },
  // ── Data Stores
  database: {
    what: 'The transactional system of record. Strong consistency and careful write ordering live here — or nowhere.',
    whenToUse:
      'One per bounded context; give it a replica, and shard or buffer before write volume outgrows a primary.',
  },
  replica: {
    what: 'A read-only copy fed asynchronously by the primary — read fanout plus a failover target.',
    whenToUse:
      'Read-heavy workloads and availability requirements: keep reads alive while the primary recovers.',
  },
  'object-store': {
    what: 'Durable blob storage for files, media and backups — cheap, effectively bottomless, slow per call.',
    whenToUse:
      'Originals, renditions and archives live here; serve them through a CDN, never straight to clients.',
  },
  'search-index': {
    what: 'An inverted index built for text queries, facets and relevance ranking.',
    whenToUse:
      "The moment requirements say 'search' — LIKE scans on the primary are a latency cliff.",
  },
  'kv-store': {
    what: 'A key-value store for sessions, counters and hot lookups — microsecond reads, no joins.',
    whenToUse:
      'Session state once services scale out, rate counters, hot lookups; give entries a TTL.',
  },
  'time-series-db': {
    what: 'Append-heavy storage for timestamped metrics and events, with retention and downsampling built in.',
    whenToUse: 'High-rate metrics or IoT streams that would drown an OLTP table.',
  },
  'vector-db': {
    what: 'Similarity search over embeddings — nearest-neighbour lookups for semantic matching.',
    whenToUse:
      "Recommendations, semantic search, RAG — anywhere 'find things like this' is the query.",
  },
  // ── Caching
  cache: {
    what: 'Keeps hot reads in memory so repeated queries never reach the database — the first answer to a read spike.',
    whenToUse:
      'Read-heavy ratios and tight latency budgets; decide the invalidation story or it serves lies.',
  },
  // ── Messaging & Streaming
  queue: {
    what: "A durable buffer between producer and consumer: absorbs bursts, retries failures, drains at the consumer's pace.",
    whenToUse:
      "Bursty writes and slow work; turn on the dead-letter queue so poison messages don't loop forever.",
  },
  'event-stream': {
    what: 'An append-only, replayable log of events that many readers consume independently at their own pace.',
    whenToUse:
      'Firehose ingest, event sourcing, replay-as-recovery; retention is the durability story.',
  },
  'pub-sub': {
    what: 'Fan-out messaging: publishers emit to topics and every subscriber gets its own copy.',
    whenToUse:
      'One fact, many interested parties — decouples producers from an open-ended set of consumers.',
  },
  'cdc-connector': {
    what: "Tails the database's change log and publishes each committed change as an event — the outbox made infrastructure.",
    whenToUse: 'Keeping caches, indexes and streams in sync without dual writes.',
  },
  'notification-service': {
    what: 'Delivers messages to humans — push, email, SMS — with batching, retries and provider fallbacks.',
    whenToUse:
      "Any 'notify the user' requirement; keep it async so a provider outage never blocks the write path.",
  },
  // ── Analytics & ML
  'stream-processor': {
    what: 'Continuously computes over event streams — windows, joins, rollups — emitting derived results downstream.',
    whenToUse:
      'Live aggregates and dashboards fed from an event stream, instead of batch jobs racing the clock.',
  },
  'data-warehouse': {
    what: 'Columnar analytical storage for big scans and joins across history — built for questions, not transactions.',
    whenToUse: 'Reports and analytics; keep the dashboards off the OLTP primary.',
  },
  'data-lake': {
    what: "Cheap storage for raw, schema-on-read data — everything lands here before it's refined.",
    whenToUse: 'Retaining raw events for reprocessing, ML training sets, and audits.',
  },
  'ml-inference': {
    what: 'Serves model predictions behind an API — embeddings, ranking, fraud scores — with its own scaling profile.',
    whenToUse: 'Whenever a requirement says score, rank, recommend or detect.',
  },
  // ── Coordination & Config
  scheduler: {
    what: 'Fires work on time — cron ticks, delays, retries with backoff. One instance with no lock is a single point of failure.',
    whenToUse:
      'Delayed steps and periodic jobs; pair with a distributed lock when running more than one.',
  },
  'workflow-engine': {
    what: 'Orchestrates multi-step processes durably: state machines, fan-out and join, retries — progress survives crashes.',
    whenToUse:
      'Long-running flows with branches and waits; it dispatches steps, workers do the work.',
  },
  'distributed-lock': {
    what: 'Coordination for moments only one holder may act: leader election, exactly-one-scheduler, critical sections.',
    whenToUse: 'Serializing an action across replicas — two schedulers, one drop.',
  },
  'id-generator': {
    what: 'Hands out unique, roughly ordered ids without a database round trip.',
    whenToUse: 'High write rates across shards where auto-increment becomes the bottleneck.',
  },
  'config-service': {
    what: 'Central runtime configuration and feature flags, changed without a deploy.',
    whenToUse: 'Kill switches, gradual rollouts, per-tenant settings.',
  },
  // ── Identity & Security
  'auth-service': {
    what: 'Owns identity: login, tokens, sessions, permissions — every protected call checks against it.',
    whenToUse:
      'Any multi-user system; gate commands at the edge with it instead of inside every service.',
  },
  'secrets-manager': {
    what: 'Guarded storage for credentials and keys, fetched at runtime with auditing and rotation.',
    whenToUse:
      'Third-party credentials and internal keys — never in code, configs or run payloads.',
  },
  waf: {
    what: 'A web application firewall filtering hostile traffic — injection, bots, floods — before it reaches the gateway.',
    whenToUse:
      'Internet-facing systems under abuse pressure; pairs with rate limiting at the front door.',
  },
  // ── Observability
  monitoring: {
    what: 'Metrics and alerting: dashboards for humans, pages for on-call. Wired in, it proves the design is observed.',
    whenToUse:
      'Every serious design — alerts should fire before users notice; satisfies the observability requirements.',
  },
  logging: {
    what: 'Centralized, searchable logs from every component — the record you debug from at 3am.',
    whenToUse: 'More than a couple of services; correlate with traces to find the failing hop.',
  },
  tracing: {
    what: 'Follows one request across every hop, showing where the latency budget actually went.',
    whenToUse: "Deep call chains and p99 hunts — you can't fix the slow hop you can't see.",
  },
  // ── External & SaaS
  'external-api': {
    what: "A third-party dependency you don't control — its latency and outages are now part of your design.",
    whenToUse:
      'Model every outside call; isolate it behind timeouts, retries and a circuit breaker.',
  },
  'payment-provider': {
    what: 'The external money-mover. Slow, rate-limited, occasionally down — and it must never double-charge.',
    whenToUse: 'Checkout flows: keep it off the hot path and make the charge idempotent.',
  },
} satisfies Record<NodeKind, NodeKindGuide>;

const OPERATION_KIND_PLURALS: Record<OperationKind, string> = {
  command: 'commands',
  query: 'queries',
  event: 'events',
  stream: 'streams',
};

/**
 * One derived sentence about a kind's interface, straight from
 * `INTERFACE_CAPABILITIES` so the guide can never drift from what the
 * editors and the eval rules actually allow. Null when the kind has nothing
 * interface-shaped to say (routing infrastructure, observability).
 */
export function interfaceSummary(kind: NodeKind): string | null {
  const capability = INTERFACE_CAPABILITIES[kind];
  switch (capability.role) {
    case 'api': {
      const plurals = capability.operationKinds.map((op) => OPERATION_KIND_PLURALS[op]);
      if (plurals.length === 0) return null;
      const list =
        plurals.length > 1
          ? `${plurals.slice(0, -1).join(', ')} and ${plurals[plurals.length - 1]}`
          : plurals[0];
      return `Can declare ${list} on its interface; connections carry them.`;
    }
    case 'channel':
      return 'Declares the message or event types it transports between producers and consumers.';
    case 'storage':
      return 'Passive storage — callers own the operations against it.';
    default:
      return null;
  }
}
