import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SUGGESTED_ID_PREFIX, type CanvasGraph, type Grade } from '@sysdesign/contracts';

import { runEngine } from '../../../engine';
import { analyticsFacts, contextFor, edge, graph, node } from '../../../testing';
import { realtimeAnalyticsExpectations } from './realtime-analytics';

const GRADE_RANK: Record<Grade, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };

/** The shared reference fixture: dashboards straight onto the metrics DB. */
const naiveGraph = JSON.parse(
  readFileSync(new URL('../../../fixtures/naive-analytics.graph.json', import.meta.url), 'utf-8'),
) as CanvasGraph;

/**
 * The reference design that meets every intro and standard expectation:
 * events buffer on a retained stream, a checkpointed processor aggregates
 * them, dashboards read through a cache with a replica behind the store, and
 * monitoring watches the pipeline.
 */
const solidGraph: CanvasGraph = graph(
  [
    node('client-1', 'client', { label: 'Dashboard browser' }),
    node('gateway-1', 'gateway', { label: 'Ingest gateway' }),
    node('service-1', 'service', { label: 'Analytics API', config: { replicas: 3 } }),
    node('event-stream-1', 'event-stream', {
      label: 'Click stream',
      config: { retentionHours: 48 },
    }),
    node('stream-processor-1', 'stream-processor', {
      label: 'Aggregation processor',
      config: { checkpointing: true },
    }),
    node('database-1', 'database', { label: 'Aggregates DB' }),
    node('replica-1', 'replica', { label: 'Read replica' }),
    node('cache-1', 'cache', { label: 'Tile cache' }),
    node('monitoring-1', 'monitoring', { label: 'Pipeline monitoring' }),
  ],
  [
    edge('edge-1', 'client-1', 'gateway-1'),
    edge('edge-2', 'gateway-1', 'service-1'),
    edge('edge-3', 'service-1', 'event-stream-1', 'async'),
    edge('edge-4', 'event-stream-1', 'stream-processor-1', 'async'),
    edge('edge-5', 'stream-processor-1', 'database-1'),
    edge('edge-6', 'service-1', 'cache-1'),
    edge('edge-7', 'cache-1', 'database-1'),
    edge('edge-8', 'database-1', 'replica-1', 'async'),
    edge('edge-9', 'service-1', 'monitoring-1', 'async'),
  ],
);

/** Expected `satisfiedBy` verdict per expectation on each fixture. */
const TABLE: Array<{ id: string; onNaive: boolean; onSolid: boolean }> = [
  { id: 'exp.rta.ingest-stream', onNaive: false, onSolid: true },
  { id: 'exp.rta.read-write-split', onNaive: false, onSolid: true },
  { id: 'exp.rta.aggregation-worker', onNaive: false, onSolid: true },
  { id: 'exp.rta.rollup-pipeline', onNaive: false, onSolid: true },
  { id: 'exp.rta.ingest-buffer-durable', onNaive: false, onSolid: true },
  { id: 'exp.rta.dashboard-cache', onNaive: false, onSolid: true },
  { id: 'exp.rta.pipeline-observed', onNaive: false, onSolid: true },
  { id: 'exp.rta.exactly-once-counts', onNaive: false, onSolid: true },
  { id: 'exp.rta.multi-region-ingest', onNaive: false, onSolid: false },
  { id: 'exp.rta.tiered-storage', onNaive: false, onSolid: false },
];

function expectationById(id: string) {
  const expectation = realtimeAnalyticsExpectations.find((candidate) => candidate.id === id);
  if (!expectation) throw new Error(`unknown expectation: ${id}`);
  return expectation;
}

describe('realtime-analytics expectation bank', () => {
  it('declares well-formed expectations gated to the archetype', () => {
    const ids = realtimeAnalyticsExpectations.map((expectation) => expectation.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const expectation of realtimeAnalyticsExpectations) {
      expect(expectation.id).toMatch(/^exp\.rta\.[a-z-]+$/);
      expect(expectation.id.length).toBeLessThanOrEqual(60);
      expect(expectation.archetypes).toEqual(['realtime-analytics']);
    }
  });

  it('covers every expectation in the verdict table exactly once', () => {
    expect(TABLE.map((row) => row.id).sort()).toEqual(
      realtimeAnalyticsExpectations.map((expectation) => expectation.id).sort(),
    );
  });

  it.each(TABLE)('$id: naive=$onNaive solid=$onSolid', ({ id, onNaive, onSolid }) => {
    const expectation = expectationById(id);
    for (const [fixture, expected] of [
      [naiveGraph, onNaive],
      [solidGraph, onSolid],
    ] as const) {
      const check = expectation.satisfiedBy(contextFor(fixture, analyticsFacts()));
      expect(check.met).toBe(expected);
      expect(check.evidenceNodeIds).toEqual([...check.evidenceNodeIds].sort());
      expect(check.evidenceEdgeIds).toEqual([...check.evidenceEdgeIds].sort());
    }
  });

  it('grades the naive three-box no better than D', () => {
    const result = runEngine(naiveGraph, analyticsFacts());
    expect(GRADE_RANK[result.grade]).toBeLessThanOrEqual(GRADE_RANK.D);
  });

  it('grades the solid pipeline at least a B', () => {
    const result = runEngine(solidGraph, analyticsFacts());
    expect(GRADE_RANK[result.grade]).toBeGreaterThanOrEqual(GRADE_RANK.B);
  });

  it('teaches on every unmet expectation — messages carry the lesson', () => {
    const result = runEngine(naiveGraph, analyticsFacts());
    const bankFindings = result.findings.filter((finding) =>
      finding.expectationId?.startsWith('exp.rta.'),
    );
    expect(bankFindings.length).toBeGreaterThan(0);
    for (const finding of bankFindings) {
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.message.length).toBeGreaterThan(20);
    }
  });

  it('suggestion patches introduce only suggested- ids and reference existing elements', () => {
    const ctx = contextFor(naiveGraph, analyticsFacts());
    const existingNodeIds = new Set(naiveGraph.nodes.map((graphNode) => graphNode.id));
    const existingEdgeIds = new Set(naiveGraph.edges.map((graphEdge) => graphEdge.id));
    const patches = realtimeAnalyticsExpectations.flatMap((expectation) => {
      const patch = expectation.suggest?.(ctx);
      return patch ? [patch] : [];
    });
    expect(patches.length).toBeGreaterThan(0);

    for (const patch of patches) {
      expect(patch.description.length).toBeGreaterThan(0);
      const introduced = new Set<string>();
      for (const op of patch.ops) {
        if (op.op === 'add-node') {
          expect(op.node.id.startsWith(SUGGESTED_ID_PREFIX)).toBe(true);
          expect(existingNodeIds.has(op.node.id)).toBe(false);
          introduced.add(op.node.id);
        } else if (op.op === 'add-edge') {
          expect(op.edge.id.startsWith(SUGGESTED_ID_PREFIX)).toBe(true);
          expect(existingEdgeIds.has(op.edge.id)).toBe(false);
          expect(existingNodeIds.has(op.edge.source) || introduced.has(op.edge.source)).toBe(true);
          expect(existingNodeIds.has(op.edge.target) || introduced.has(op.edge.target)).toBe(true);
        } else if (op.op === 'remove-edge') {
          expect(existingEdgeIds.has(op.edgeId)).toBe(true);
        } else {
          expect(existingNodeIds.has(op.nodeId)).toBe(true);
        }
      }
    }
  });
});
