import type { Archetype, NfrItem } from '@sysdesign/contracts';

import { ARCHETYPE_BASELINES } from './archetype-templates';

/**
 * The pools the generator samples from. Per archetype: 8+ functional
 * requirements, 6+ NFRs (at least two latency and two availability entries, so
 * the guaranteed picks still vary by seed), and the advanced-only twists that
 * raise the difficulty ceiling (multi-region, exactly-once, cost caps).
 *
 * Latency/availability targets are template literals over
 * `ARCHETYPE_BASELINES`, so an NFR can never quote a number the scale targets
 * do not carry.
 */
export interface RequirementBank {
  functional: readonly string[];
  nfrs: readonly NfrItem[];
  advancedTwists: readonly NfrItem[];
}

const B = ARCHETYPE_BASELINES;

export const REQUIREMENT_BANKS = {
  'flash-sale-ticketing': {
    functional: [
      'Buyers browse upcoming events and see live seat/ticket availability',
      'A buyer reserves tickets, holding inventory for a bounded time before payment',
      'Checkout captures payment and finalizes the order exactly once',
      'Expired reservations release their inventory automatically',
      'A waiting-room admits buyers into the sale at a controlled rate',
      'Buyers receive an order confirmation with a verifiable ticket credential',
      'Operations can configure per-event inventory, pricing tiers and sale windows',
      'A buyer can view and cancel their orders, returning inventory when allowed',
      'Fraud and bot signals can flag a purchase for review before fulfilment',
    ],
    nfrs: [
      {
        kind: 'latency',
        statement: 'Availability reads stay fast for every buyer during the on-sale spike',
        target: `p99 ≤ ${B['flash-sale-ticketing'].p99LatencyMs}ms at peak RPS`,
      },
      {
        kind: 'latency',
        statement: 'Checkout confirmation returns quickly enough that buyers do not double-submit',
        target: `p99 ≤ ${B['flash-sale-ticketing'].p99LatencyMs * 2}ms end to end`,
      },
      {
        kind: 'availability',
        statement: 'The sale window stays up for the full on-sale, spike included',
        target: `≥ ${B['flash-sale-ticketing'].availabilityPct}% during sale windows`,
      },
      {
        kind: 'availability',
        statement: 'Browsing and order history survive a checkout-path outage',
        target: 'read paths degrade independently of writes',
      },
      {
        kind: 'consistency',
        statement:
          'Inventory never oversells, even under concurrent reservations for the last seat',
        target: 'zero oversell',
      },
      {
        kind: 'durability',
        statement: 'A confirmed order is never lost, whatever fails after payment capture',
      },
      {
        kind: 'throughput',
        statement: 'The reservation path absorbs the opening-minute stampede without collapsing',
        target: 'sustain stated peak RPS for 10 minutes',
      },
      {
        kind: 'observability',
        statement: 'Oversell risk, queue depth and payment failures are visible in near-real time',
      },
    ],
    advancedTwists: [
      {
        kind: 'availability',
        statement: 'A full region outage during an on-sale must not stop the sale',
        target: 'multi-region active/active or failover with RTO ≤ 5 min',
      },
      {
        kind: 'consistency',
        statement: 'Payment capture and inventory decrement behave exactly-once across retries',
        target: 'idempotent checkout across client and worker retries',
      },
      {
        kind: 'cost',
        statement: 'The fleet scales down between sales — idle capacity is capped',
        target: 'off-peak infrastructure ≤ 20% of peak spend',
      },
    ],
  },
  'media-streaming-pipeline': {
    functional: [
      'Creators upload large video files with resumable, validated uploads',
      'Uploaded media is transcoded into multiple renditions for adaptive playback',
      'Viewers stream video with adaptive bitrate from edge locations',
      'Browse and search surfaces titles by metadata, popularity and freshness',
      'A drop can gate content behind a release timestamp visible to all viewers at once',
      'Playback position and watch history sync across a viewer’s devices',
      'Creators see per-title analytics: views, completion rate, geography',
      'Moderation can take down an asset and invalidate cached copies',
      'Thumbnails and previews are generated automatically from source media',
    ],
    nfrs: [
      {
        kind: 'latency',
        statement: 'Playback start (click to first frame) stays fast for cached titles',
        target: `p99 ≤ ${B['media-streaming-pipeline'].p99LatencyMs}ms for manifest and first segment`,
      },
      {
        kind: 'latency',
        statement: 'Browse and search respond quickly even during a drop',
        target: `p99 ≤ ${B['media-streaming-pipeline'].p99LatencyMs}ms`,
      },
      {
        kind: 'availability',
        statement: 'Playback of already-published titles survives pipeline outages',
        target: `≥ ${B['media-streaming-pipeline'].availabilityPct}% for the delivery path`,
      },
      {
        kind: 'availability',
        statement: 'A drop moment must not take down the rest of the catalog',
        target: 'per-title isolation under hot-spot load',
      },
      {
        kind: 'durability',
        statement: 'Source media is never lost after upload acknowledgement',
        target: 'originals durably stored before transcode begins',
      },
      {
        kind: 'throughput',
        statement: 'The transcode pipeline keeps up with upload bursts without unbounded backlog',
        target: 'backlog drains within 1 hour of a burst',
      },
      {
        kind: 'cost',
        statement: 'Egress is served from cache — origin bandwidth stays a small fraction of total',
        target: '≥ 90% cache hit ratio for video segments',
      },
      {
        kind: 'observability',
        statement: 'Rebuffer rate, cache hit ratio and transcode lag are dashboarded',
      },
    ],
    advancedTwists: [
      {
        kind: 'availability',
        statement: 'Delivery survives the loss of an entire region or CDN provider',
        target: 'multi-CDN or multi-region failover, RTO ≤ 5 min',
      },
      {
        kind: 'consistency',
        statement: 'A drop unlocks for every viewer within one second of the release timestamp',
        target: 'globally consistent gate, skew ≤ 1s',
      },
      {
        kind: 'cost',
        statement: 'Storage cost is capped: cold renditions tier down or are rebuilt on demand',
        target: 'storage spend growth sublinear in catalog size',
      },
    ],
  },
  'workflow-automation': {
    functional: [
      'Customers compose workflows from triggers, conditions and actions',
      'Workflows execute automatically when their trigger events arrive',
      'A workflow run is inspectable step by step, with inputs and outputs',
      'Failed steps retry with backoff and surface to the customer after exhaustion',
      'Customers can test a workflow against sample data before enabling it',
      'Workflow definitions are versioned; in-flight runs finish on their version',
      'Actions call third-party APIs with per-customer credentials and rate limits',
      'Customers can pause, resume and cancel workflows and individual runs',
      'An audit log records who changed which workflow and when',
    ],
    nfrs: [
      {
        kind: 'latency',
        statement: 'Trigger-to-first-action stays fast for interactive automations',
        target: `p99 ≤ ${B['workflow-automation'].p99LatencyMs}ms from event to first action dispatch`,
      },
      {
        kind: 'latency',
        statement: 'The workflow editor loads and validates definitions quickly',
        target: `p99 ≤ ${B['workflow-automation'].p99LatencyMs}ms for definition reads`,
      },
      {
        kind: 'availability',
        statement: 'Trigger ingestion stays up even when downstream actions are failing',
        target: `≥ ${B['workflow-automation'].availabilityPct}% for event intake`,
      },
      {
        kind: 'availability',
        statement: 'One customer’s pathological workflow cannot degrade the platform for others',
        target: 'per-tenant isolation and quotas',
      },
      {
        kind: 'consistency',
        statement: 'A single trigger event executes a workflow exactly once, retries included',
      },
      {
        kind: 'durability',
        statement: 'Accepted trigger events are never dropped, even across deploys and crashes',
      },
      {
        kind: 'security',
        statement: 'Third-party credentials are encrypted at rest and scoped per customer',
      },
      {
        kind: 'observability',
        statement: 'Run success rate, queue lag and third-party error rates are visible per tenant',
      },
    ],
    advancedTwists: [
      {
        kind: 'availability',
        statement: 'The engine keeps executing through a full region outage',
        target: 'multi-region workers, RTO ≤ 10 min',
      },
      {
        kind: 'consistency',
        statement: 'Side-effecting actions are exactly-once across worker crashes and retries',
        target: 'idempotency keys end to end',
      },
      {
        kind: 'cost',
        statement: 'Execution cost per run is metered and capped per pricing tier',
        target: 'per-tenant compute budgets enforced',
      },
    ],
  },
  'realtime-analytics': {
    functional: [
      'Events are ingested continuously from many producers with schema validation',
      'Live dashboards show aggregates over sliding windows of recent events',
      'Users drill down from an aggregate to the underlying event records',
      'Alert rules evaluate continuously and notify when thresholds are crossed',
      'Historical queries span months of data with filtering and grouping',
      'Dashboards are shareable with per-user access control',
      'Late or out-of-order events are folded into the correct windows',
      'Rollups are computed automatically so old data stays queryable cheaply',
      'An export pushes filtered event slices to external destinations',
    ],
    nfrs: [
      {
        kind: 'latency',
        statement: 'Live dashboard tiles reflect new events within seconds',
        target: 'event-to-dashboard lag p99 ≤ 5s',
      },
      {
        kind: 'latency',
        statement: 'Dashboard queries return fast enough to feel live',
        target: `p99 ≤ ${B['realtime-analytics'].p99LatencyMs}ms per tile query`,
      },
      {
        kind: 'availability',
        statement: 'Ingestion keeps accepting events while query infrastructure degrades',
        target: `≥ ${B['realtime-analytics'].availabilityPct}% for the write path`,
      },
      {
        kind: 'availability',
        statement: 'Dashboards stay readable during ingestion backlogs — stale beats down',
        target: 'read path independent of ingest health',
      },
      {
        kind: 'throughput',
        statement: 'The pipeline sustains the full event firehose with headroom for spikes',
        target: 'sustained ingest at stated peak with 3x burst headroom',
      },
      {
        kind: 'consistency',
        statement: 'A given event is counted exactly once in every aggregate it belongs to',
      },
      {
        kind: 'durability',
        statement: 'Acknowledged events survive broker and worker failures',
      },
      {
        kind: 'observability',
        statement: 'Ingest lag, dropped-event counts and query latency are themselves dashboarded',
      },
    ],
    advancedTwists: [
      {
        kind: 'availability',
        statement: 'Ingestion and dashboards survive a full region outage without data loss',
        target: 'multi-region replication, RPO ≈ 0',
      },
      {
        kind: 'consistency',
        statement: 'Exactly-once aggregation holds across reprocessing and pipeline restarts',
      },
      {
        kind: 'cost',
        statement: 'Storage and compute stay within budget as event volume grows 100x',
        target: 'tiered storage; query cost sublinear in retained volume',
      },
    ],
  },
  'dag-orchestration': {
    functional: [
      'Clients submit a DAG of dependent steps for execution',
      'The scheduler dispatches steps whose dependencies have completed',
      'Step results are persisted and fed as inputs to dependent steps',
      'Failed steps retry with backoff up to a per-step attempt budget',
      'A run can be paused, resumed and cancelled without corrupting its state',
      'Fan-out steps spawn dynamic children and a join waits for all of them',
      'Operators inspect any run: per-step status, timings, inputs and outputs',
      'Completed runs are queryable by status, tag and time range',
      'A dead-letter path captures steps that exhaust their retries',
    ],
    nfrs: [
      {
        kind: 'latency',
        statement:
          'Dependency-ready steps are dispatched promptly — scheduling is not the bottleneck',
        target: `ready-to-dispatched p99 ≤ ${B['dag-orchestration'].p99LatencyMs}ms`,
      },
      {
        kind: 'latency',
        statement: 'Run-status queries return quickly even for large DAGs',
        target: `p99 ≤ ${B['dag-orchestration'].p99LatencyMs}ms for status reads`,
      },
      {
        kind: 'availability',
        statement: 'The control plane accepts submissions while workers churn',
        target: `≥ ${B['dag-orchestration'].availabilityPct}% for submission and status APIs`,
      },
      {
        kind: 'availability',
        statement: 'A worker crash delays its steps but never stalls the whole engine',
        target: 'orphaned work reclaimed automatically',
      },
      {
        kind: 'durability',
        statement: 'Completed-step progress survives any single component failure',
        target: 'no completed work is re-run after recovery',
      },
      {
        kind: 'consistency',
        statement: 'Each step’s side effects happen exactly once from the caller’s point of view',
        target: 'retries are idempotent',
      },
      {
        kind: 'throughput',
        statement: 'Thousands of concurrent runs make progress without head-of-line blocking',
      },
      {
        kind: 'observability',
        statement: 'Stuck runs, retry storms and queue depth are alertable before users notice',
      },
    ],
    advancedTwists: [
      {
        kind: 'availability',
        statement: 'Runs keep progressing through a full region outage',
        target: 'multi-region scheduler failover, RTO ≤ 10 min',
      },
      {
        kind: 'consistency',
        statement: 'Exactly-once step effects hold even across split-brain scheduler failover',
      },
      {
        kind: 'cost',
        statement: 'Idle capacity is capped: workers scale to zero when no runs are active',
        target: 'compute spend proportional to active runs',
      },
    ],
  },
} as const satisfies Record<Archetype, RequirementBank>;
