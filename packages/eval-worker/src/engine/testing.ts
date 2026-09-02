/**
 * Tiny builders the engine specs share. Pure helpers only — no vitest imports,
 * so this file compiles under the app tsconfig even though only specs use it.
 */
import type {
  CanvasEdge,
  CanvasGraph,
  CanvasNode,
  DesignBrief,
  EdgeKind,
  FlowBinding,
  NarrationFacts,
  NfrBinding,
  NodeConfig,
  NodeKind,
  NodeOperation,
  WorkflowSpec,
} from '@sysdesign/contracts';

import type { LlmClient } from '@sysdesign/llm';

import type { GraphIndex } from './graph-index';
import { buildGraphIndex } from './graph-index';
import { RULES } from './rules';
import type { EvalRule, PromptFacts, RuleContext } from './types';

/** An enabled client that returns one canned structured response (or null = failure). */
export function fakeLlm(response: unknown): LlmClient {
  return {
    enabled: true,
    model: 'test-model',
    completeStructured: <T>() => Promise.resolve(response as T | null),
  };
}

export function node(
  id: string,
  kind: NodeKind,
  options: {
    label?: string;
    config?: NodeConfig;
    responsibilities?: string[];
    operations?: NodeOperation[];
  } = {},
): CanvasNode {
  return {
    id,
    kind,
    label: options.label ?? id,
    ...(options.config ? { config: options.config } : {}),
    ...(options.responsibilities ? { responsibilities: options.responsibilities } : {}),
    ...(options.operations ? { operations: options.operations } : {}),
  };
}

export function edge(
  id: string,
  source: string,
  target: string,
  kind?: EdgeKind,
  carries?: string[],
): CanvasEdge {
  return { id, source, target, ...(kind ? { kind } : {}), ...(carries ? { carries } : {}) };
}

export function graph(nodes: CanvasNode[], edges: CanvasEdge[] = []): CanvasGraph {
  return { nodes, edges };
}

export function flashSaleFacts(overrides: Partial<PromptFacts> = {}): PromptFacts {
  return {
    archetype: 'flash-sale-ticketing',
    difficulty: 'standard',
    scaleTargets: {
      concurrentUsers: 50000,
      requestsPerSecond: 8000,
      readWriteRatio: '95:5',
      p99LatencyMs: 250,
      availabilityPct: '99.95',
    },
    nfrKinds: ['availability', 'latency', 'throughput'],
    nfrs: [
      {
        id: 'fst-avail-sale-window',
        kind: 'availability',
        statement: 'The sale window stays up for the full on-sale, spike included',
        target: '≥ 99.95% during sale windows',
        targetSpec: { metric: 'availability_pct', op: '>=', value: 99.95, unit: '%' },
      },
      {
        id: 'fst-lat-read-spike',
        kind: 'latency',
        statement: 'Availability reads stay fast for every buyer during the on-sale spike',
        target: 'p99 ≤ 250ms at peak RPS',
        targetSpec: { metric: 'p99_latency_ms', op: '<=', value: 250, unit: 'ms' },
      },
      {
        id: 'fst-thr-stampede',
        kind: 'throughput',
        statement: 'The reservation path absorbs the opening-minute stampede without collapsing',
        target: 'sustain stated peak RPS for 10 minutes',
        targetSpec: { metric: 'sustained_peak_minutes', op: '>=', value: 10, unit: 'min' },
      },
    ],
    functionalCapabilities: ['payments'],
    functionalRequirementCount: 4,
    functionalText:
      'browse upcoming events; reserve seats during the on-sale; purchase tickets; view order confirmation',
    workflow: null,
    ...overrides,
  };
}

export function analyticsFacts(overrides: Partial<PromptFacts> = {}): PromptFacts {
  return {
    archetype: 'realtime-analytics',
    difficulty: 'standard',
    scaleTargets: {
      concurrentUsers: 2000,
      requestsPerSecond: 1500,
      readWriteRatio: '70:30',
      p99LatencyMs: 500,
      availabilityPct: '99.9',
    },
    nfrKinds: ['latency', 'throughput', 'durability', 'observability'],
    nfrs: [
      {
        id: 'rta-lat-tile-query',
        kind: 'latency',
        statement: 'Dashboard queries return fast enough to feel live',
        target: 'p99 ≤ 500ms per tile query',
        targetSpec: { metric: 'p99_latency_ms', op: '<=', value: 500, unit: 'ms' },
      },
      {
        id: 'rta-thr-firehose',
        kind: 'throughput',
        statement: 'The pipeline sustains the full event firehose with headroom for spikes',
        target: 'sustained ingest at stated peak with 3x burst headroom',
        targetSpec: { metric: 'burst_headroom_x', op: '>=', value: 3, unit: 'x' },
      },
      {
        id: 'rta-dur-ingest',
        kind: 'durability',
        statement: 'Accepted events survive a consumer crash and replay without gaps',
        target: 'buffer replayable for 24h',
        targetSpec: { metric: 'buffer_retention_hours', op: '>=', value: 24, unit: 'h' },
      },
      {
        id: 'rta-obs-pipeline',
        kind: 'observability',
        statement: 'Pipeline lag and ingest errors surface as alerts before dashboards go stale',
        target: 'consumer lag alerting in place',
        targetSpec: null,
      },
    ],
    functionalCapabilities: ['analytics'],
    functionalRequirementCount: 4,
    functionalText: 'ingest click events; render live dashboards; export historical reports',
    workflow: null,
    ...overrides,
  };
}

export function mediaFacts(overrides: Partial<PromptFacts> = {}): PromptFacts {
  return {
    archetype: 'media-streaming-pipeline',
    difficulty: 'standard',
    scaleTargets: {
      concurrentUsers: 120000,
      requestsPerSecond: 6000,
      readWriteRatio: '70:30',
      p99LatencyMs: 400,
      availabilityPct: '99.9',
    },
    nfrKinds: ['durability', 'throughput', 'observability'],
    nfrs: [
      {
        id: 'msp-dur-originals',
        kind: 'durability',
        statement: 'An accepted upload is never lost, whatever fails mid-transcode',
        target: 'zero accepted uploads lost',
        targetSpec: { metric: 'accepted_uploads_lost', op: '=', value: 0, unit: 'uploads' },
      },
      {
        id: 'msp-thr-transcode',
        kind: 'throughput',
        statement: 'The transcode pipeline keeps up with upload peaks without unbounded backlog',
        target: 'backlog drains within 30 minutes of a peak',
        targetSpec: { metric: 'backlog_drain_minutes', op: '<=', value: 30, unit: 'min' },
      },
      {
        id: 'msp-obs-pipeline',
        kind: 'observability',
        statement: 'A stalled transcode backlog pages someone before uploaders notice',
        target: 'queue depth and failure-rate alerting in place',
        targetSpec: null,
      },
    ],
    functionalCapabilities: ['search'],
    functionalRequirementCount: 4,
    functionalText:
      'upload videos; transcode into renditions; stream playback worldwide; search the media catalog',
    workflow: null,
    ...overrides,
  };
}

export function workflowFacts(overrides: Partial<PromptFacts> = {}): PromptFacts {
  return {
    archetype: 'workflow-automation',
    difficulty: 'standard',
    scaleTargets: {
      concurrentUsers: 8000,
      requestsPerSecond: 900,
      readWriteRatio: '50:50',
      p99LatencyMs: 300,
      availabilityPct: '99.9',
    },
    nfrKinds: ['durability', 'security', 'observability'],
    nfrs: [
      {
        id: 'wfa-dur-triggers',
        kind: 'durability',
        statement: 'An accepted trigger always produces a run, whatever fails in between',
        target: 'zero accepted triggers lost',
        targetSpec: { metric: 'accepted_triggers_lost', op: '=', value: 0, unit: 'triggers' },
      },
      {
        id: 'wfa-sec-credentials',
        kind: 'security',
        statement: 'Tenant credentials stay scoped to their tenant and out of run payloads',
        target: 'credentials fetched per action from a guarded store',
        targetSpec: null,
      },
      {
        id: 'wfa-obs-runs',
        kind: 'observability',
        statement: 'A failing tenant workflow pages the platform before the tenant notices',
        target: 'run failure-rate alerting in place',
        targetSpec: null,
      },
    ],
    functionalCapabilities: [],
    functionalRequirementCount: 4,
    functionalText:
      'define automation workflows; fire triggers from webhooks; execute third-party actions; view run history',
    workflow: null,
    ...overrides,
  };
}

export function dagFacts(overrides: Partial<PromptFacts> = {}): PromptFacts {
  return {
    archetype: 'dag-orchestration',
    difficulty: 'standard',
    scaleTargets: {
      concurrentUsers: 1200,
      requestsPerSecond: 400,
      readWriteRatio: '60:40',
      p99LatencyMs: 800,
      availabilityPct: '99.9',
    },
    nfrKinds: ['availability', 'latency', 'observability'],
    nfrs: [
      {
        id: 'dag-avail-orphans',
        kind: 'availability',
        statement: 'A dead worker never strands a run — orphaned steps are reclaimed and rerun',
        target: 'orphaned steps redelivered within 5 minutes',
        targetSpec: { metric: 'orphan_reclaim_minutes', op: '<=', value: 5, unit: 'min' },
      },
      {
        id: 'dag-lat-status',
        kind: 'latency',
        statement: 'Run-status dashboards stay responsive while pipelines execute',
        target: 'p99 ≤ 800ms per status query',
        targetSpec: { metric: 'p99_latency_ms', op: '<=', value: 800, unit: 'ms' },
      },
      {
        id: 'dag-obs-runs',
        kind: 'observability',
        statement: 'A run missing its window raises an alert before downstream data goes stale',
        target: 'run-duration and backlog alerting in place',
        targetSpec: null,
      },
    ],
    functionalCapabilities: [],
    functionalRequirementCount: 4,
    functionalText:
      'define pipelines as dags; schedule and dispatch steps; retry failed steps; view run status',
    workflow: null,
    ...overrides,
  };
}

/**
 * The order-history archetype's standard-tier business layer, mirrored from
 * the generator's `workflow-specs.ts` (eval-worker may not import studio-api
 * — app→app is blocked, so calibration carries its own copy the way every
 * facts builder carries its bank's NFRs). The e2e suite grades against the
 * live generator's spec, which is what keeps this mirror honest.
 */
export function orderHistoryWorkflowSpec(): WorkflowSpec {
  return {
    version: 1,
    entities: [
      {
        id: 'ent-order',
        name: 'Order (history projection)',
        states: ['received', 'indexed', 'amended'],
        transitions: [
          { from: null, to: 'received', via: 'ing-shopify-webhooks' },
          { from: null, to: 'received', via: 'ing-pos-import' },
          { from: 'received', to: 'indexed', via: 'op-ingest-index' },
          { from: 'indexed', to: 'amended', via: 'evt-order-refunded' },
        ],
      },
    ],
    operations: [
      {
        id: 'op-list-orders',
        kind: 'query',
        statement: 'Return the authenticated customer’s merged order history, paginated',
      },
      {
        id: 'op-ingest-index',
        kind: 'command',
        statement: 'Normalize an incoming order and upsert it into the read model exactly once',
        consumes: ['evt-online-order-received', 'evt-offline-order-received', 'evt-order-refunded'],
        emits: ['evt-order-indexed'],
        onFailureEmits: ['evt-ingest-failed'],
      },
      {
        id: 'op-get-order',
        kind: 'query',
        statement: 'Return one order’s detail for its owner',
      },
      {
        id: 'op-resync-customer',
        kind: 'command',
        statement: 'Re-sync one customer’s orders from both sources',
        emits: ['evt-order-indexed'],
      },
    ],
    events: [
      { id: 'evt-online-order-received', statement: 'A new online order arrived by webhook' },
      { id: 'evt-offline-order-received', statement: 'The POS import delivered in-store orders' },
      { id: 'evt-order-indexed', statement: 'An order became queryable in the read model' },
      { id: 'evt-order-refunded', statement: 'A refund was reported for an existing order' },
      { id: 'evt-ingest-failed', statement: 'An order failed normalization' },
    ],
    aggregations: [
      {
        id: 'agg-spend-summary',
        statement: 'A spend summary tile totals purchases across both channels',
        sourceEventIds: ['evt-order-indexed', 'evt-order-refunded'],
      },
    ],
    ingests: [
      {
        id: 'ing-shopify-webhooks',
        mode: 'push',
        statement: 'The storefront pushes order webhooks',
        nfrId: 'ohi-fresh-online',
        emits: ['evt-online-order-received', 'evt-order-refunded'],
      },
      {
        id: 'ing-pos-import',
        mode: 'pull',
        statement: 'Poll the Retail POS for new and changed orders',
        nfrId: 'ohi-fresh-offline',
        emits: ['evt-offline-order-received'],
      },
    ],
  };
}

export function orderHistoryFacts(overrides: Partial<PromptFacts> = {}): PromptFacts {
  return {
    archetype: 'order-history-integration',
    difficulty: 'standard',
    scaleTargets: {
      concurrentUsers: 20000,
      requestsPerSecond: 1500,
      readWriteRatio: '98:2',
      p99LatencyMs: 300,
      availabilityPct: '99.9',
    },
    nfrKinds: ['latency', 'availability', 'security', 'consistency'],
    nfrs: [
      {
        id: 'ohi-lat-history-read',
        kind: 'latency',
        statement: 'The order history page stays fast while both ingests run',
        target: 'p99 ≤ 300ms',
        targetSpec: { metric: 'p99_latency_ms', op: '<=', value: 300, unit: 'ms' },
      },
      {
        id: 'ohi-fresh-online',
        kind: 'consistency',
        statement: 'An online order is visible within a minute of the storefront confirming it',
        target: 'visible ≤ 60s after purchase',
        targetSpec: { metric: 'freshness_seconds', op: '<=', value: 60, unit: 's' },
      },
      {
        id: 'ohi-fresh-offline',
        kind: 'consistency',
        statement: 'An in-store POS sale is visible within five minutes of ringing up',
        target: 'visible ≤ 300s after sale',
        targetSpec: { metric: 'freshness_seconds', op: '<=', value: 300, unit: 's' },
      },
      {
        id: 'ohi-avail-history',
        kind: 'availability',
        statement: 'The history read path holds through business hours and promos',
        target: '≥ 99.9%',
        targetSpec: { metric: 'availability_pct', op: '>=', value: 99.9, unit: '%' },
      },
      {
        id: 'ohi-sec-own-orders',
        kind: 'security',
        statement: 'A logged-in customer can read only their own orders, and a guest can read none',
        target: 'authorization enforced before any order row is returned',
        targetSpec: { metric: 'cross_customer_reads', op: '=', value: 0, unit: 'orders' },
      },
      {
        id: 'ohi-con-no-dupes',
        kind: 'consistency',
        statement: 'An order reported by both sources appears exactly once',
        target: 'zero duplicate rows',
        targetSpec: { metric: 'duplicate_orders', op: '=', value: 0, unit: 'orders' },
      },
    ],
    functionalCapabilities: ['analytics', 'scheduled-work'],
    functionalRequirementCount: 5,
    functionalText:
      'show a merged paginated order history; import pos orders on a schedule; update refunded orders; show a spend summary tile; scope every read to the signed-in customer',
    workflow: orderHistoryWorkflowSpec(),
    ...overrides,
  };
}

export function contextFor(
  canvas: CanvasGraph,
  facts: PromptFacts = flashSaleFacts(),
  narrative: string | null = null,
  brief: DesignBrief | null = null,
  narration: NarrationFacts | null = null,
): RuleContext {
  return { graph: canvas, facts, index: buildGraphIndex(canvas), narrative, brief, narration };
}

/**
 * A complete narration for grading a design that is "solid AND explained": every
 * component has a substantive rationale, every functional requirement is
 * narrated, and the overview reads as prose. Passing this lifts the "no top
 * grade without a walkthrough" cap, so a bank test can assert the grade its
 * structure earns rather than the ceiling a missing narrative would impose.
 */
export function fullNarration(canvas: CanvasGraph, facts: PromptFacts): NarrationFacts {
  return {
    present: true,
    overviewSubstantive: true,
    explainedNodeIds: [...canvas.nodes.map((node) => node.id)].sort(),
    narratedRequirementIndexes: Array.from(
      { length: facts.functionalRequirementCount },
      (_unused, index) => index,
    ),
  };
}

/** A brief literal without the ceremony — specs only ever vary the bindings. */
export function brief(nfrBindings: NfrBinding[] = [], flows: FlowBinding[] = []): DesignBrief {
  return { version: 1, nfrBindings, flows };
}

export function indexFor(canvas: CanvasGraph): GraphIndex {
  return buildGraphIndex(canvas);
}

export function ruleById(id: string): EvalRule {
  const rule = RULES.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`unknown rule: ${id}`);
  return rule;
}
