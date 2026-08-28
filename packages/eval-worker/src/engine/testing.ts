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
} from '@sysdesign/contracts';

import type { GraphIndex } from './graph-index';
import { buildGraphIndex } from './graph-index';
import { RULES } from './rules';
import type { EvalRule, PromptFacts, RuleContext } from './types';

export function node(
  id: string,
  kind: NodeKind,
  options: { label?: string; config?: NodeConfig } = {},
): CanvasNode {
  return {
    id,
    kind,
    label: options.label ?? id,
    ...(options.config ? { config: options.config } : {}),
  };
}

export function edge(id: string, source: string, target: string, kind?: EdgeKind): CanvasEdge {
  return { id, source, target, ...(kind ? { kind } : {}) };
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
    nfrKinds: ['latency', 'throughput'],
    functionalText: 'ingest click events; render live dashboards; export historical reports',
    ...overrides,
  };
}

export function contextFor(
  canvas: CanvasGraph,
  facts: PromptFacts = flashSaleFacts(),
): RuleContext {
  return { graph: canvas, facts, index: buildGraphIndex(canvas) };
}

export function indexFor(canvas: CanvasGraph): GraphIndex {
  return buildGraphIndex(canvas);
}

export function ruleById(id: string): EvalRule {
  const rule = RULES.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`unknown rule: ${id}`);
  return rule;
}
