/**
 * Tiny builders the engine specs share. Pure helpers only — no vitest imports,
 * so this file compiles under the app tsconfig even though only specs use it.
 */
import type {
  CanvasEdge,
  CanvasGraph,
  CanvasNode,
  EdgeKind,
  NodeConfig,
  NodeKind,
  NodeOperation,
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
    functionalText:
      'browse upcoming events; reserve seats during the on-sale; purchase tickets; view order confirmation',
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
    functionalText: 'ingest click events; render live dashboards; export historical reports',
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
    functionalText:
      'upload videos; transcode into renditions; stream playback worldwide; search the media catalog',
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
    functionalText:
      'define automation workflows; fire triggers from webhooks; execute third-party actions; view run history',
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
    functionalText:
      'define pipelines as dags; schedule and dispatch steps; retry failed steps; view run status',
    ...overrides,
  };
}

export function contextFor(
  canvas: CanvasGraph,
  facts: PromptFacts = flashSaleFacts(),
  narrative: string | null = null,
): RuleContext {
  return { graph: canvas, facts, index: buildGraphIndex(canvas), narrative };
}

export function indexFor(canvas: CanvasGraph): GraphIndex {
  return buildGraphIndex(canvas);
}

export function ruleById(id: string): EvalRule {
  const rule = RULES.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`unknown rule: ${id}`);
  return rule;
}
