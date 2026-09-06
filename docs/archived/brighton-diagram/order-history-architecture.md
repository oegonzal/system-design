# Order History service — design notes

Companion to [`order-history-architecture.pdf`](./order-history-architecture.pdf) (one-page architecture diagram).

## The problem

A retail brand's storefront runs on Shopify. Online orders live in Shopify (GraphQL Admin API plus webhooks); in-store sales live in a separate Retail POS that only answers REST calls. My Account › Order History must show **both** in one list, and:

| Requirement                                                        | Target                    |
| ------------------------------------------------------------------ | ------------------------- |
| One Order History list inside My Account on the Shopify storefront | functional                |
| Online (Shopify) and in-store (Retail POS) orders in that one list | functional                |
| An online order appears in the list                                | within 1 minute           |
| An in-store sale appears in the list                               | within 5 minutes          |
| A signed-in shopper sees only their own orders                     | zero cross-customer reads |
| A guest (not signed in) sees no orders                             | refused before any lookup |

The brief states no scale, so the design assumes 2,000 concurrent shoppers, 150 requests/s at a 98:2 read:write ratio, p99 ≤ 300 ms on the history page, 99.9% availability for the read path, and the full order history retained.

## Architecture at a glance

Two systems of record become one history by treating both as producers of the **same event**. Shopify pushes order and customer webhooks; the Retail POS is polled every minute from a durable watermark. Both land on one at-least-once FIFO queue, grouped by a canonical order key so versions of one order stay in sequence, and a single idempotent indexer drains it into an order store partitioned by customer id. The read path — page → API gateway → History API → cache/store — never calls Shopify or the POS, so a source outage leaves the history readable and merely stale.

The hard problem is **identity**: an in-store sale carries the shopper's loyalty id, not a Shopify customer id. The design resolves it only through exact links (loyalty id → Shopify customer id) held in a merchant-owned Shopify customer metafield, never through an email typed at a till. Links are bulk-loaded before cutover, kept fresh by customer webhooks and periodic re-sync, and a sale whose link is missing is retried against Shopify within a minute. Sales with no loyalty id are nobody's history and never enter the queue.

**Freshness** is owned end to end: online orders are visible within seconds because the indexer bumps the customer's cache version after each commit; in-store sales within one poll interval plus seconds — five times inside the five-minute bar. **Completeness** is owned by a reconciler that backfills before cutover and then sweeps both sources in tiers up to a weekly full comparison, republishing anything missing at a bounded rate so live orders never queue behind it.

## Language and platform choices

- **TypeScript everywhere on the backend (NestJS on ECS Fargate for long-lived services and workers, Node.js Lambda for bursty or scheduled functions).** One shared package holds the canonical order model, the event envelope, the canonical-key rule and the version comparator; every producer and consumer imports it, so normalization is written once. Python was considered for the importer and reconciler (ETL-shaped jobs) and rejected: a second runtime would duplicate exactly that shared model, and neither job needs Python's data tooling.
- **Vue 3** for the storefront page, bundled into a Shopify theme app extension.
- **Amazon SQS FIFO** rather than Kafka or Kinesis: at roughly three order events per second the design needs per-order ordering, at-least-once delivery and a dead-letter queue, all of which SQS FIFO provides with nothing to operate. Replay is not needed from the broker because completeness is guaranteed by the reconciler's sweeps, not by re-reading a log.
- **PostgreSQL** rather than MongoDB: the workload is relational (orders, links, checkpoints, unclaimed sales), needs unique constraints on the canonical order key, declarative partitioning by customer id, serializable transactions for claims, and keyset pagination over a covering index.
- **Redis** only as a version-keyed page cache with a fail-open read path; it never holds anything durable.
- **Datadog** for APM, metrics, logs and monitors, with CloudWatch supplying the SQS metrics.

## Components

### My Account page

- **Purpose:** renders the merged, paginated Order History inside the shopper's account area on the storefront.
- **Stack:** Vue 3 + Vite, bundled as a Shopify theme app extension block.
- **Choices:** the shopper signs in through Shopify customer accounts (OpenID Connect) in the storefront session, so the page already holds an ID token; it calls the API with that token and an opaque page cursor, keeps no state, and never sees a customer id it could tamper with.

### API gateway

- **Purpose:** decides identity at the edge — accepts signed-in shoppers, refuses guests before any lookup, and shields the API.
- **Stack:** AWS API Gateway (HTTP API) with a Lambda authorizer (Node.js) and per-customer throttling.
- **Choices:** validates the ID token's signature against Shopify's JWKS, refreshed in the background daily and served from cache (if a refresh fails the cached keys stay valid until their 24-hour expiry, then validation fails closed and pages); takes the customer id from the token's subject; forwards a short-lived assertion signed with our own key (60 s, audience = History API, bound to the request id) so the API never trusts a caller-supplied id. Emits token rejections and JWKS failures to monitoring.

### History API

- **Purpose:** serves `listOrders` — one customer's merged history, newest first, paginated.
- **Stack:** NestJS (Node.js 20) on ECS Fargate; three tasks at roughly 100 req/s each so losing one still covers the 150 req/s peak; autoscaling 3–8 on p95 latency with a ~90 s scale-out.
- **Choices:** verifies the gateway assertion and binds `customer_id` as a mandatory predicate, so no query shape can cross customers. Keyset pagination on (ordered_at desc, order_id) behind an opaque cursor over a covering index, so an order indexed between two pages never shifts a row; tombstoned rows are excluded. Cache-aside: reads the cache first, the store on a miss, and bypasses the cache entirely when Redis is unreachable. Reports latency, error rate and cache hit rate.

### History cache

- **Purpose:** absorbs repeat page loads (mostly page one) and protects p99 for the heaviest customers.
- **Stack:** Amazon ElastiCache for Redis.
- **Choices:** pages are keyed by (customer id, version, cursor). The version is a per-customer counter the indexer increments after every processed message, so a bump costs one INCR, invalidates every page of that customer at once without scanning keys, and a fill made from a pre-commit read lands under a version nobody reads again. Version keys carry no TTL; the 30-second TTL on pages only garbage-collects. Staleness is bounded by the bump, not the TTL.

### Order store

- **Purpose:** the one read model the list is served from; also holds identity links and ingest checkpoints.
- **Stack:** Amazon RDS for PostgreSQL, Multi-AZ with managed failover (about a minute, inside the availability budget), behind RDS Proxy, with backups.
- **Choices:** hash-partitioned by `customer_id` so a customer's history is one partition scan. Tables: `orders` (unique on the canonical key of originating system + order id; a version per source; status open/cancelled/refunded/returned/voided/deleted; the mirrored id when both systems hold the sale), `unclaimed_sales` (keyed by loyalty id, so unresolved rows never hash into a null partition — a claim is an insert into `orders`), `customer_links` (unique on loyalty id and on customer id), `import_checkpoints` (the POS watermark and the job leases). Claims and link upserts run as serializable transactions.

### Shopify (external)

- **Purpose:** system of record for online orders and for customers, including the loyalty id kept in a merchant-owned customer metafield that only the loyalty platform writes.
- **Interface:** pushes `orders/create`, `orders/updated`, `orders/cancelled`, `orders/delete`, `customers/update` and `customers/redact` webhooks with full payloads; the GraphQL Admin API answers `orderQuery` and `customerQuery` for the reconciler, which uses bulk operations for wide windows so the cost-based throttle is never exhausted.
- **Choices:** two-second timeout, two retries and a circuit breaker on every call; the live ingest path never calls it.

### Webhook receiver

- **Purpose:** turns Shopify webhooks into queue events, fast and without state.
- **Stack:** AWS Lambda (Node.js 20, TypeScript) behind an API Gateway endpoint; reserved concurrency for burst headroom.
- **Choices:** verifies each delivery's HMAC and accepts every valid one, including Shopify's own late retries; acknowledges inside the five-second deadline; publishes the full payload as `OrderReceivedOnline` (a delete as a tombstone version), `CustomerUpdated` or `CustomerRedacted`. Derives the message key from the payload alone: an order whose source identifier names a POS receipt is keyed as that POS sale, so both copies share one group and one row. Keeps no dedupe state — the indexer's version guard converges duplicates.

### POS importer

- **Purpose:** the pull ingest for in-store sales.
- **Stack:** AWS Lambda (Node.js 20, TypeScript) triggered by an EventBridge schedule every 60 s; a warm standby contends for the same lease.
- **Choices:** holds a 90-second lease in `import_checkpoints`, so a lost instance costs at most two polls. Reads `ordersSince` from the watermark with a five-minute overlap in pages of 500, publishes each sale that carries a loyalty id once per (id, updated_at) pair, and advances the checkpoint only after the page is published — a restart replays a window instead of skipping one. During a POS brown-out it shrinks pages to 100 and retries inside the cycle; afterwards it drains the backlog at a bounded rate, pausing while the queue's oldest message is older than 20 seconds.

### Retail POS (external)

- **Purpose:** system of record for in-store sales; REST only, so it is polled rather than pushed.
- **Interface:** `ordersSince`, paged by updated_at and id, returning voided sales with their status.
- **Choices:** three-second timeout, two retries and a half-open circuit breaker that keeps probing, so a slow POS delays imports rather than exhausting the importer.

### Orders queue

- **Purpose:** the single lane both sources feed and the one consumer drains; the boundary that keeps a source outage or burst off the read path.
- **Stack:** Amazon SQS FIFO with a dead-letter queue; at-least-once delivery, five receives before dead-lettering.
- **Choices:** message groups are the canonical order key — immutable and shared by both copies of a mirrored sale — so every version of one order is delivered in sequence; customer events group by customer id. Depth, oldest-message age and dead-letter depth go to monitoring; the same age attribute is what the reconciler and importer read before each batch to pause publishing.

### Order indexer

- **Purpose:** the only writer of the order store — normalizes both order shapes, resolves identity, and applies versions exactly once.
- **Stack:** NestJS worker on ECS Fargate, two tasks with four consumers each, long-polling the queue.
- **Choices:** resolves a POS sale only through the loyalty-id link; a sale with no link yet goes to `unclaimed_sales`, and a `CustomerUpdated` event upserts links and claims waiting rows in one serializable transaction. Upserts by canonical key only when that source's version is newer; each row keeps a version per source and the originating system owns status, so a mirrored copy never overwrites a POS void. A changed link re-attributes that loyalty id's rows with an audit row. `CustomerRedacted` anonymises personal data in place, keeps the order rows, and purges the link and unclaimed rows. Bumps the customer's cache version after each commit and reports per-source freshness lag.

### Reconciler

- **Purpose:** makes the history complete rather than merely live — a dropped webhook or a failed message becomes a delay, never a hole.
- **Stack:** NestJS standalone application run as ECS Fargate scheduled tasks (long sweeps exceed Lambda's limits), each tier under its own lease.
- **Choices:** before cutover it bulk-loads customer links and the full order history; then every minute it re-resolves unclaimed sales through `customerQuery` and compares the last 15 minutes, hourly the last day, daily the last week and weekly everything, via Shopify bulk operations and paged POS reads, so no gap outlives a week. Republishes every missing, older-version or source-deleted order as the ordinary event, at most 50 a second and paused while the queue's oldest message exceeds 20 seconds. Redrives dead letters and quarantines any that fail twice, with the reason recorded.

### Monitoring & alerting

- **Purpose:** turns the freshness and completeness promises into measured, paged signals.
- **Stack:** Datadog (APM, metrics, logs, monitors) with CloudWatch supplying SQS metrics.
- **Receives:** latency, error rate and cache hit rate from the History API; token rejections and JWKS failures from the gateway; failover state from the store; webhook receipt and rejection rates from the receiver; poll success and cursor age from the importer; sweep and quarantine counts from the reconciler; per-source freshness lag from the indexer; depth, age and dead-letter depth from the queue.
- **Pages when:** lag nears either freshness bar, a sale with a known link stays unclaimed past five minutes, the dead-letter queue is non-empty, or the importer misses two polls.

## How the requirements are met

| Requirement                     | Mechanism                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One list in My Account          | Vue page inside the storefront → gateway → History API; one store, one query                                                                                |
| Both sources in one list        | Both sources produce the same event; one indexer, one canonical order key, one store                                                                        |
| Online orders within 1 minute   | Webhook → queue → indexer in seconds; cache invalidated by version bump on commit                                                                           |
| In-store sales within 5 minutes | 60-second poll from a durable watermark; idempotent upserts make the overlap free                                                                           |
| Only your own orders            | Gateway-verified identity, signed assertion, `customer_id` bound on every query, cache keys namespaced by customer, identity links by exact loyalty id only |
| Guests see nothing              | No ID token → refused at the gateway before any lookup                                                                                                      |

## Two failure scenarios, walked through

- **Shopify replays an hour of webhooks, duplicated and out of order.** Every message is keyed by the canonical order id and versioned per source; the indexer applies a version only when newer, so replays converge to the same rows, and the cache version bump keeps pages consistent. Nothing on the read path is involved.
- **The POS API times out on most calls for 40 minutes, then recovers to a full store-day backlog.** The importer keeps polling with smaller pages and retries, so sales keep flowing at a reduced rate; the watermark advances only after publishing, so nothing is skipped; monitoring pages on missed polls. On recovery the backlog drains at a bounded rate, pausing whenever live queue age grows, so online orders keep their one-minute bar. Shoppers keep reading their history throughout, from the store, at most stale.

## Assessment result

Graded in the practice studio against exactly the requirements above: **100 / 100 (A)** on the deterministic rubric (every applicable expectation met, no rule violations) and **93.6 / 100 (A)** under the five-lens expert review (critic, depth, narrative, workability, adversarial scenarios), where the remaining points are the reviewers' suggestions for deepening rather than gaps in the requirements.
