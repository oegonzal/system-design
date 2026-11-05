import type { NodeKind } from './canvas';

/**
 * The in-app teaching guide: what each block kind is and when to reach for
 * it. Shown in the properties panel when a block is selected and as the
 * palette hover text — the product explains its own vocabulary instead of
 * assuming it. Every kind is described by the responsibility it holds, not
 * by the load it withstands: a design earns its blocks from what the goal
 * asks, and the right answer to a small goal is the simple one.
 */
export interface NodeKindGuide {
  /** What the block is, present tense, one sentence. */
  what: string;
  /** The signal that a design needs one. */
  whenToUse: string;
}

export const NODE_KIND_GUIDE = {
  // ── Application
  actor: {
    what: 'A person or outside party with a role in the system — customer, approver, operator, partner — who triggers work and is owed an outcome.',
    whenToUse:
      'Whenever the goal names who does what: a request path, a workflow and a permission all start from an actor.',
  },
  module: {
    what: 'A unit of code inside a deployable with one owner and a declared interface — a bounded context, a package, a layer.',
    whenToUse:
      'To show the seams inside one deployable: who owns which data and decisions, and which way the dependencies point.',
  },
  // ── Clients & Edge
  client: {
    what: 'The browsers, apps and other programs that call the system — what the actors use to reach it.',
    whenToUse:
      'Start every design with one, so what users can actually reach is traceable from the first hop.',
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
    what: 'Spreads incoming requests across identical instances so no single machine is the only one serving.',
    whenToUse:
      'In front of a tier that runs more than one instance, for availability as much as for load.',
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
    what: 'One deployable owning one responsibility and exposing it as a contract — the commands, queries and events it declares.',
    whenToUse:
      'Where a capability needs its own deployment or owner; split only along a seam the goal pays for, and declare its operations.',
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
    what: 'The system of record for the entities it owns: their invariants, their lifecycle and the transactions that keep them consistent.',
    whenToUse:
      'One per owner of data; say which entities it keeps and who writes them. Replicas, partitions and buffers only when the goal states the load.',
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
  'file-store': {
    what: 'A shared file system many instances, containers and functions mount at once — files by path, not objects by key.',
    whenToUse:
      'Workers that must all read and write the same files mid-processing; never the place a record of truth lives.',
  },
  // ── Caching
  cache: {
    what: 'Keeps repeated reads in memory so they never reach the store — at the price of serving data that may be stale.',
    whenToUse:
      'When a stated read ratio or latency budget needs it; decide the invalidation story or it serves lies, and say what you gave up.',
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
  'query-engine': {
    what: 'A serverless SQL engine that queries data where it already lies — a lake, an export, a log bucket — without loading it first.',
    whenToUse:
      'Ad-hoc questions over files and lake tables that no warehouse needs to own; pay per query, not per cluster.',
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
    what: 'Follows one request across every hop, showing where its time and its failures actually went.',
    whenToUse:
      "Call chains across several parts — you can't fix the slow or failing hop you can't see.",
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
