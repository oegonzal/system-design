import type { Archetype, FunctionalCapability, NfrItem } from '@sysdesign/contracts';

import { ARCHETYPE_BASELINES } from './archetype-templates';

/**
 * The pools the generator samples from. Per archetype: 8+ functional
 * requirements, 6+ NFRs (at least two latency and two availability entries, so
 * the guaranteed picks still vary by seed), the signature invariant the
 * scenario prose always asserts, and the advanced-only twists that raise the
 * difficulty ceiling (multi-region, exactly-once, cost caps).
 *
 * Every NFR carries a stable `id` (findings cite it as proof of which
 * requirement a design misses) and, where the prose target quantifies one
 * number, a machine-readable `targetSpec`. Both are template literals /
 * derivations over `ARCHETYPE_BASELINES`, so an NFR can never quote a number
 * the scale targets do not carry.
 */
/**
 * A functional requirement is a sentence for the human PLUS the closed-vocabulary
 * capabilities it demands, so the engine never has to read the sentence. The
 * bank that writes the prose declares the tags, which is what keeps the two
 * from drifting.
 */
export interface FunctionalRequirementSeed {
  text: string;
  capabilities: readonly FunctionalCapability[];
}

export interface RequirementBank {
  functional: readonly FunctionalRequirementSeed[];
  /**
   * The archetype-defining invariant (zero oversell, originals never lost…).
   * Scenario prose asserts it unconditionally, so the generator draws it on
   * every prompt — the requirement list must state every bar the engine
   * grades. Must name an entry in `nfrs`.
   */
  signatureNfrId: string;
  nfrs: readonly NfrItem[];
  advancedTwists: readonly NfrItem[];
}

const B = ARCHETYPE_BASELINES;

export const REQUIREMENT_BANKS = {
  'flash-sale-ticketing': {
    functional: [
      {
        text: 'Buyers browse upcoming events and see live seat/ticket availability',
        capabilities: [],
      },
      {
        text: 'A buyer reserves tickets, holding inventory for a bounded time before payment',
        capabilities: ['payments'],
      },
      {
        text: 'Checkout captures payment and finalizes the order exactly once',
        capabilities: ['payments'],
      },
      { text: 'Expired reservations release their inventory automatically', capabilities: [] },
      { text: 'A waiting-room admits buyers into the sale at a controlled rate', capabilities: [] },
      {
        text: 'Buyers receive an order confirmation with a verifiable ticket credential',
        capabilities: [],
      },
      {
        text: 'Operations can configure per-event inventory, pricing tiers and sale windows',
        capabilities: [],
      },
      {
        text: 'A buyer can view and cancel their orders, returning inventory when allowed',
        capabilities: [],
      },
      {
        text: 'Fraud and bot signals can flag a purchase for review before fulfilment',
        capabilities: ['payments'],
      },
    ],
    signatureNfrId: 'fst-con-oversell',
    nfrs: [
      {
        id: 'fst-lat-read-spike',
        kind: 'latency',
        statement: 'Availability reads stay fast for every buyer during the on-sale spike',
        target: `p99 ≤ ${B['flash-sale-ticketing'].p99LatencyMs}ms at peak RPS`,
        targetSpec: {
          metric: 'p99_latency_ms',
          op: '<=',
          value: B['flash-sale-ticketing'].p99LatencyMs,
          unit: 'ms',
        },
      },
      {
        id: 'fst-lat-checkout',
        kind: 'latency',
        statement: 'Checkout confirmation returns quickly enough that buyers do not double-submit',
        target: `p99 ≤ ${B['flash-sale-ticketing'].p99LatencyMs * 2}ms end to end`,
        targetSpec: {
          metric: 'p99_latency_ms',
          op: '<=',
          value: B['flash-sale-ticketing'].p99LatencyMs * 2,
          unit: 'ms',
        },
      },
      {
        id: 'fst-avail-sale-window',
        kind: 'availability',
        statement: 'The sale window stays up for the full on-sale, spike included',
        target: `≥ ${B['flash-sale-ticketing'].availabilityPct}% during sale windows`,
        targetSpec: {
          metric: 'availability_pct',
          op: '>=',
          value: Number(B['flash-sale-ticketing'].availabilityPct),
          unit: '%',
        },
      },
      {
        id: 'fst-avail-read-independent',
        kind: 'availability',
        statement: 'Browsing and order history survive a checkout-path outage',
        target: 'read paths degrade independently of writes',
      },
      {
        id: 'fst-con-oversell',
        kind: 'consistency',
        statement:
          'Inventory never oversells, even under concurrent reservations for the last seat',
        target: 'zero oversell',
        targetSpec: { metric: 'oversell_count', op: '=', value: 0, unit: 'orders' },
      },
      {
        id: 'fst-dur-confirmed-order',
        kind: 'durability',
        statement: 'A confirmed order is never lost, whatever fails after payment capture',
      },
      {
        id: 'fst-thr-stampede',
        kind: 'throughput',
        statement: 'The reservation path absorbs the opening-minute stampede without collapsing',
        target: 'sustain stated peak RPS for 10 minutes',
        targetSpec: { metric: 'sustained_peak_minutes', op: '>=', value: 10, unit: 'min' },
      },
      {
        id: 'fst-sec-bot-shed',
        kind: 'security',
        statement:
          'Bot and scripted-buyer traffic is shed at the edge before it consumes checkout capacity',
        target: '≥ 95% of scripted traffic dropped before the reservation tier',
        targetSpec: { metric: 'bot_shed_pct', op: '>=', value: 95, unit: '%' },
      },
      {
        id: 'fst-obs-pipeline',
        kind: 'observability',
        statement: 'Oversell risk, queue depth and payment failures are visible in near-real time',
      },
    ],
    advancedTwists: [
      {
        id: 'fst-avail-multi-region',
        kind: 'availability',
        statement: 'A full region outage during an on-sale must not stop the sale',
        target: 'multi-region active/active or failover with RTO ≤ 5 min',
        targetSpec: { metric: 'rto_minutes', op: '<=', value: 5, unit: 'min' },
      },
      {
        id: 'fst-con-exactly-once',
        kind: 'consistency',
        statement: 'Payment capture and inventory decrement behave exactly-once across retries',
        target: 'idempotent checkout across client and worker retries',
      },
      {
        id: 'fst-cost-idle-cap',
        kind: 'cost',
        statement: 'The fleet scales down between sales — idle capacity is capped',
        target: 'off-peak infrastructure ≤ 20% of peak spend',
        targetSpec: { metric: 'off_peak_spend_pct', op: '<=', value: 20, unit: '%' },
      },
    ],
  },
  'media-streaming-pipeline': {
    functional: [
      {
        text: 'Creators upload large video files with resumable, validated uploads',
        capabilities: [],
      },
      {
        text: 'Uploaded media is transcoded into multiple renditions for adaptive playback',
        capabilities: [],
      },
      { text: 'Viewers stream video with adaptive bitrate from edge locations', capabilities: [] },
      {
        text: 'Browse and search surfaces titles by metadata, popularity and freshness',
        capabilities: ['search'],
      },
      {
        text: 'A drop can gate content behind a release timestamp visible to all viewers at once',
        capabilities: ['scheduled-work'],
      },
      {
        text: 'Playback position and watch history sync across a viewer’s devices',
        capabilities: [],
      },
      {
        text: 'Creators see per-title analytics: views, completion rate, geography',
        capabilities: ['analytics'],
      },
      { text: 'Moderation can take down an asset and invalidate cached copies', capabilities: [] },
      {
        text: 'Thumbnails and previews are generated automatically from source media',
        capabilities: [],
      },
    ],
    signatureNfrId: 'msp-dur-originals',
    nfrs: [
      {
        id: 'msp-lat-playback-start',
        kind: 'latency',
        statement: 'Playback start (click to first frame) stays fast for cached titles',
        target: `p99 ≤ ${B['media-streaming-pipeline'].p99LatencyMs}ms for manifest and first segment`,
        targetSpec: {
          metric: 'p99_latency_ms',
          op: '<=',
          value: B['media-streaming-pipeline'].p99LatencyMs,
          unit: 'ms',
        },
      },
      {
        id: 'msp-lat-browse',
        kind: 'latency',
        statement: 'Browse and search respond quickly even during a drop',
        target: `p99 ≤ ${B['media-streaming-pipeline'].p99LatencyMs}ms`,
        targetSpec: {
          metric: 'p99_latency_ms',
          op: '<=',
          value: B['media-streaming-pipeline'].p99LatencyMs,
          unit: 'ms',
        },
      },
      {
        id: 'msp-avail-delivery',
        kind: 'availability',
        statement: 'Playback of already-published titles survives pipeline outages',
        target: `≥ ${B['media-streaming-pipeline'].availabilityPct}% for the delivery path`,
        targetSpec: {
          metric: 'availability_pct',
          op: '>=',
          value: Number(B['media-streaming-pipeline'].availabilityPct),
          unit: '%',
        },
      },
      {
        id: 'msp-avail-drop-isolation',
        kind: 'availability',
        statement: 'A drop moment must not take down the rest of the catalog',
        target: 'per-title isolation under hot-spot load',
      },
      {
        id: 'msp-dur-originals',
        kind: 'durability',
        statement: 'Source media is never lost after upload acknowledgement',
        target: 'originals durably stored before transcode begins',
      },
      {
        id: 'msp-thr-transcode',
        kind: 'throughput',
        statement: 'The transcode pipeline keeps up with upload bursts without unbounded backlog',
        target: 'backlog drains within 1 hour of a burst',
        targetSpec: { metric: 'backlog_drain_hours', op: '<=', value: 1, unit: 'h' },
      },
      {
        id: 'msp-cost-cache-egress',
        kind: 'cost',
        statement: 'Egress is served from cache — origin bandwidth stays a small fraction of total',
        target: '≥ 90% cache hit ratio for video segments',
        targetSpec: { metric: 'cache_hit_pct', op: '>=', value: 90, unit: '%' },
      },
      {
        id: 'msp-obs-pipeline',
        kind: 'observability',
        statement: 'Rebuffer rate, cache hit ratio and transcode lag are dashboarded',
      },
    ],
    advancedTwists: [
      {
        id: 'msp-avail-multi-cdn',
        kind: 'availability',
        statement: 'Delivery survives the loss of an entire region or CDN provider',
        target: 'multi-CDN or multi-region failover, RTO ≤ 5 min',
        targetSpec: { metric: 'rto_minutes', op: '<=', value: 5, unit: 'min' },
      },
      {
        id: 'msp-con-drop-gate',
        kind: 'consistency',
        statement: 'A drop unlocks for every viewer within one second of the release timestamp',
        target: 'globally consistent gate, skew ≤ 1s',
        targetSpec: { metric: 'gate_skew_seconds', op: '<=', value: 1, unit: 's' },
      },
      {
        id: 'msp-cost-storage-tiering',
        kind: 'cost',
        statement: 'Storage cost is capped: cold renditions tier down or are rebuilt on demand',
        target: 'storage spend growth sublinear in catalog size',
      },
    ],
  },
  'workflow-automation': {
    functional: [
      {
        text: 'Customers compose workflows from triggers, conditions and actions',
        capabilities: [],
      },
      {
        text: 'Workflows execute automatically when their trigger events arrive',
        capabilities: [],
      },
      {
        text: 'A workflow run is inspectable step by step, with inputs and outputs',
        capabilities: [],
      },
      {
        text: 'Failed steps retry with backoff and surface to the customer after exhaustion',
        capabilities: [],
      },
      {
        text: 'A workflow step can wait — e.g. delay N days before the next action — and fire on schedule',
        capabilities: ['scheduled-work'],
      },
      {
        text: 'Customers can test a workflow against sample data before enabling it',
        capabilities: [],
      },
      {
        text: 'Workflow definitions are versioned; in-flight runs finish on their version',
        capabilities: [],
      },
      {
        text: 'Actions call third-party APIs with per-customer credentials and rate limits',
        capabilities: [],
      },
      {
        text: 'Customers can pause, resume and cancel workflows and individual runs',
        capabilities: [],
      },
      { text: 'An audit log records who changed which workflow and when', capabilities: [] },
    ],
    signatureNfrId: 'wfa-dur-triggers',
    nfrs: [
      {
        id: 'wfa-lat-trigger-dispatch',
        kind: 'latency',
        statement: 'Trigger-to-first-action stays fast for interactive automations',
        target: `p99 ≤ ${B['workflow-automation'].p99LatencyMs}ms from event to first action dispatch`,
        targetSpec: {
          metric: 'p99_latency_ms',
          op: '<=',
          value: B['workflow-automation'].p99LatencyMs,
          unit: 'ms',
        },
      },
      {
        id: 'wfa-lat-editor',
        kind: 'latency',
        statement: 'The workflow editor loads and validates definitions quickly',
        target: `p99 ≤ ${B['workflow-automation'].p99LatencyMs}ms for definition reads`,
        targetSpec: {
          metric: 'p99_latency_ms',
          op: '<=',
          value: B['workflow-automation'].p99LatencyMs,
          unit: 'ms',
        },
      },
      {
        id: 'wfa-avail-intake',
        kind: 'availability',
        statement: 'Trigger ingestion stays up even when downstream actions are failing',
        target: `≥ ${B['workflow-automation'].availabilityPct}% for event intake`,
        targetSpec: {
          metric: 'availability_pct',
          op: '>=',
          value: Number(B['workflow-automation'].availabilityPct),
          unit: '%',
        },
      },
      {
        id: 'wfa-avail-tenant-isolation',
        kind: 'availability',
        statement: 'One customer’s pathological workflow cannot degrade the platform for others',
        target: 'per-tenant isolation and quotas',
      },
      {
        id: 'wfa-con-exactly-once-run',
        kind: 'consistency',
        statement: 'A single trigger event executes a workflow exactly once, retries included',
      },
      {
        id: 'wfa-dur-triggers',
        kind: 'durability',
        statement: 'Accepted trigger events are never dropped, even across deploys and crashes',
      },
      {
        id: 'wfa-sec-credentials',
        kind: 'security',
        statement: 'Third-party credentials are encrypted at rest and scoped per customer',
      },
      {
        id: 'wfa-obs-tenant',
        kind: 'observability',
        statement: 'Run success rate, queue lag and third-party error rates are visible per tenant',
      },
    ],
    advancedTwists: [
      {
        id: 'wfa-avail-multi-region',
        kind: 'availability',
        statement: 'The engine keeps executing through a full region outage',
        target: 'multi-region workers, RTO ≤ 10 min',
        targetSpec: { metric: 'rto_minutes', op: '<=', value: 10, unit: 'min' },
      },
      {
        id: 'wfa-con-exactly-once-actions',
        kind: 'consistency',
        statement: 'Side-effecting actions are exactly-once across worker crashes and retries',
        target: 'idempotency keys end to end',
      },
      {
        id: 'wfa-cost-budgets',
        kind: 'cost',
        statement: 'Execution cost per run is metered and capped per pricing tier',
        target: 'per-tenant compute budgets enforced',
      },
    ],
  },
  'realtime-analytics': {
    functional: [
      {
        text: 'Events are ingested continuously from many producers with schema validation',
        capabilities: [],
      },
      {
        text: 'Live dashboards show aggregates over sliding windows of recent events',
        capabilities: ['analytics'],
      },
      {
        text: 'Users drill down from an aggregate to the underlying event records',
        capabilities: ['analytics'],
      },
      {
        text: 'Alert rules evaluate continuously and notify when thresholds are crossed',
        capabilities: [],
      },
      {
        text: 'Historical queries span months of data with filtering and grouping',
        capabilities: ['analytics'],
      },
      {
        text: 'Dashboards are shareable with per-user access control',
        capabilities: ['analytics'],
      },
      { text: 'Late or out-of-order events are folded into the correct windows', capabilities: [] },
      {
        text: 'Rollups are computed automatically so old data stays queryable cheaply',
        capabilities: ['analytics'],
      },
      { text: 'An export pushes filtered event slices to external destinations', capabilities: [] },
    ],
    signatureNfrId: 'rta-con-count-once',
    nfrs: [
      {
        id: 'rta-lat-dashboard-lag',
        kind: 'latency',
        statement: 'Live dashboard tiles reflect new events within seconds',
        target: 'event-to-dashboard lag p99 ≤ 5s',
        targetSpec: { metric: 'event_to_dashboard_p99_seconds', op: '<=', value: 5, unit: 's' },
      },
      {
        id: 'rta-lat-tile-query',
        kind: 'latency',
        statement: 'Dashboard queries return fast enough to feel live',
        target: `p99 ≤ ${B['realtime-analytics'].p99LatencyMs}ms per tile query`,
        targetSpec: {
          metric: 'p99_latency_ms',
          op: '<=',
          value: B['realtime-analytics'].p99LatencyMs,
          unit: 'ms',
        },
      },
      {
        id: 'rta-avail-ingest',
        kind: 'availability',
        statement: 'Ingestion keeps accepting events while query infrastructure degrades',
        target: `≥ ${B['realtime-analytics'].availabilityPct}% for the write path`,
        targetSpec: {
          metric: 'availability_pct',
          op: '>=',
          value: Number(B['realtime-analytics'].availabilityPct),
          unit: '%',
        },
      },
      {
        id: 'rta-avail-read-independent',
        kind: 'availability',
        statement: 'Dashboards stay readable during ingestion backlogs — stale beats down',
        target: 'read path independent of ingest health',
      },
      {
        id: 'rta-thr-firehose',
        kind: 'throughput',
        statement: 'The pipeline sustains the full event firehose with headroom for spikes',
        target: 'sustained ingest at stated peak with 3x burst headroom',
        targetSpec: { metric: 'burst_headroom_x', op: '>=', value: 3, unit: 'x' },
      },
      {
        id: 'rta-con-count-once',
        kind: 'consistency',
        statement: 'A given event is counted exactly once in every aggregate it belongs to',
      },
      {
        id: 'rta-dur-acknowledged',
        kind: 'durability',
        statement: 'Acknowledged events survive broker and worker failures',
      },
      {
        id: 'rta-obs-self',
        kind: 'observability',
        statement: 'Ingest lag, dropped-event counts and query latency are themselves dashboarded',
      },
    ],
    advancedTwists: [
      {
        id: 'rta-avail-multi-region',
        kind: 'availability',
        statement: 'Ingestion and dashboards survive a full region outage without data loss',
        target: 'multi-region replication, RPO ≈ 0',
      },
      {
        id: 'rta-con-exactly-once-reprocess',
        kind: 'consistency',
        statement: 'Exactly-once aggregation holds across reprocessing and pipeline restarts',
      },
      {
        id: 'rta-cost-tiered',
        kind: 'cost',
        statement: 'Storage and compute stay within budget as event volume grows 100x',
        target: 'tiered storage; query cost sublinear in retained volume',
      },
    ],
  },
  'dag-orchestration': {
    functional: [
      { text: 'Clients submit a DAG of dependent steps for execution', capabilities: [] },
      {
        text: 'The scheduler dispatches steps whose dependencies have completed',
        capabilities: [],
      },
      { text: 'Step results are persisted and fed as inputs to dependent steps', capabilities: [] },
      { text: 'Failed steps retry with backoff up to a per-step attempt budget', capabilities: [] },
      {
        text: 'A run can be paused, resumed and cancelled without corrupting its state',
        capabilities: [],
      },
      {
        text: 'Fan-out steps spawn dynamic children and a join waits for all of them',
        capabilities: [],
      },
      {
        text: 'Operators inspect any run: per-step status, timings, inputs and outputs',
        capabilities: [],
      },
      { text: 'Completed runs are queryable by status, tag and time range', capabilities: [] },
      { text: 'A dead-letter path captures steps that exhaust their retries', capabilities: [] },
    ],
    signatureNfrId: 'dag-dur-progress',
    nfrs: [
      {
        id: 'dag-lat-dispatch',
        kind: 'latency',
        statement:
          'Dependency-ready steps are dispatched promptly — scheduling is not the bottleneck',
        target: `ready-to-dispatched p99 ≤ ${B['dag-orchestration'].p99LatencyMs}ms`,
        targetSpec: {
          metric: 'p99_latency_ms',
          op: '<=',
          value: B['dag-orchestration'].p99LatencyMs,
          unit: 'ms',
        },
      },
      {
        id: 'dag-lat-status',
        kind: 'latency',
        statement: 'Run-status queries return quickly even for large DAGs',
        target: `p99 ≤ ${B['dag-orchestration'].p99LatencyMs}ms for status reads`,
        targetSpec: {
          metric: 'p99_latency_ms',
          op: '<=',
          value: B['dag-orchestration'].p99LatencyMs,
          unit: 'ms',
        },
      },
      {
        id: 'dag-avail-control-plane',
        kind: 'availability',
        statement: 'The control plane accepts submissions while workers churn',
        target: `≥ ${B['dag-orchestration'].availabilityPct}% for submission and status APIs`,
        targetSpec: {
          metric: 'availability_pct',
          op: '>=',
          value: Number(B['dag-orchestration'].availabilityPct),
          unit: '%',
        },
      },
      {
        id: 'dag-avail-worker-crash',
        kind: 'availability',
        statement: 'A worker crash delays its steps but never stalls the whole engine',
        target: 'orphaned work reclaimed automatically',
      },
      {
        id: 'dag-dur-progress',
        kind: 'durability',
        statement: 'Completed-step progress survives any single component failure',
        target: 'no completed work is re-run after recovery',
      },
      {
        id: 'dag-con-idempotent-steps',
        kind: 'consistency',
        statement: 'Each step’s side effects happen exactly once from the caller’s point of view',
        target: 'retries are idempotent',
      },
      {
        id: 'dag-thr-concurrent-runs',
        kind: 'throughput',
        statement: 'Concurrent runs make progress without head-of-line blocking',
        target: 'sustain 5000 concurrent runs',
        targetSpec: { metric: 'concurrent_runs', op: '>=', value: 5000, unit: 'runs' },
      },
      {
        id: 'dag-obs-alerting',
        kind: 'observability',
        statement: 'Stuck runs, retry storms and queue depth are alertable before users notice',
      },
    ],
    advancedTwists: [
      {
        id: 'dag-avail-multi-region',
        kind: 'availability',
        statement: 'Runs keep progressing through a full region outage',
        target: 'multi-region scheduler failover, RTO ≤ 10 min',
        targetSpec: { metric: 'rto_minutes', op: '<=', value: 10, unit: 'min' },
      },
      {
        id: 'dag-con-split-brain',
        kind: 'consistency',
        statement: 'Exactly-once step effects hold even across split-brain scheduler failover',
      },
      {
        id: 'dag-cost-scale-zero',
        kind: 'cost',
        statement: 'Idle capacity is capped: workers scale to zero when no runs are active',
        target: 'compute spend proportional to active runs',
      },
    ],
  },
} as const satisfies Record<Archetype, RequirementBank>;
