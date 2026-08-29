import { describe, expect, it } from 'vitest';

import { SUGGESTED_ID_PREFIX, type CanvasGraph, type Grade } from '@sysdesign/contracts';

import { runEngine } from '../../../engine';
import { contextFor, dagFacts, edge, graph, node } from '../../../testing';
import { dagOrchestrationExpectations } from './dag';

const GRADE_RANK: Record<Grade, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };

/** The three-box starting point every author draws first. */
const naiveGraph: CanvasGraph = graph(
  [
    node('client-1', 'client', { label: 'Ops console' }),
    node('service-1', 'service', { label: 'Pipeline service' }),
    node('database-1', 'database', { label: 'Runs DB' }),
  ],
  [edge('edge-1', 'client-1', 'service-1'), edge('edge-2', 'service-1', 'database-1')],
);

/**
 * The reference design that meets every intro and standard expectation: a
 * scheduler behind leader election dispatches through a redelivering queue
 * into an idempotent, concurrency-bounded worker pool, both sides checkpoint
 * into a replicated run-state DB, status reads hit a KV store, and monitoring
 * watches the runs.
 */
const solidGraph: CanvasGraph = graph(
  [
    node('client-1', 'client', { label: 'Pipeline console' }),
    node('gateway-1', 'gateway', { label: 'API gateway' }),
    node('service-1', 'service', { label: 'Orchestration API', config: { replicas: 3 } }),
    node('scheduler-1', 'scheduler', { label: 'DAG scheduler' }),
    node('distributed-lock-1', 'distributed-lock', { label: 'Leader election' }),
    node('queue-1', 'queue', {
      label: 'Step queue',
      config: { dlq: true, delivery: 'at-least-once', maxRetries: 5 },
    }),
    node('worker-1', 'worker', {
      label: 'Step worker',
      config: { idempotent: true, concurrency: 8 },
    }),
    node('database-1', 'database', { label: 'Run-state DB', config: { replicas: 2 } }),
    node('kv-store-1', 'kv-store', { label: 'Status store' }),
    node('monitoring-1', 'monitoring', { label: 'Run monitoring' }),
  ],
  [
    edge('edge-1', 'client-1', 'gateway-1'),
    edge('edge-2', 'gateway-1', 'service-1'),
    edge('edge-3', 'service-1', 'database-1'),
    edge('edge-4', 'service-1', 'kv-store-1'),
    edge('edge-5', 'scheduler-1', 'queue-1', 'async'),
    edge('edge-6', 'queue-1', 'worker-1', 'async'),
    edge('edge-7', 'worker-1', 'database-1'),
    edge('edge-8', 'service-1', 'monitoring-1', 'async'),
    edge('edge-9', 'scheduler-1', 'distributed-lock-1'),
  ],
);

/** Expected `satisfiedBy` verdict per expectation on each fixture. */
const TABLE: Array<{ id: string; onNaive: boolean; onSolid: boolean }> = [
  { id: 'exp.dag.scheduler-present', onNaive: false, onSolid: true },
  { id: 'exp.dag.worker-pool', onNaive: false, onSolid: true },
  { id: 'exp.dag.state-checkpoint', onNaive: false, onSolid: true },
  { id: 'exp.dag.dispatch-queue', onNaive: false, onSolid: true },
  { id: 'exp.dag.step-dlq', onNaive: false, onSolid: true },
  { id: 'exp.dag.orphan-reclaim', onNaive: false, onSolid: true },
  { id: 'exp.dag.status-read-path', onNaive: false, onSolid: true },
  { id: 'exp.dag.runs-observed', onNaive: false, onSolid: true },
  { id: 'exp.dag.idempotent-steps', onNaive: false, onSolid: true },
  // The leader-election lock guarding the scheduler doubles as HA evidence.
  { id: 'exp.dag.scheduler-ha', onNaive: false, onSolid: true },
  { id: 'exp.dag.scale-to-zero', onNaive: false, onSolid: true },
];

function expectationById(id: string) {
  const expectation = dagOrchestrationExpectations.find((candidate) => candidate.id === id);
  if (!expectation) throw new Error(`unknown expectation: ${id}`);
  return expectation;
}

describe('dag-orchestration expectation bank', () => {
  it('declares well-formed expectations gated to the archetype', () => {
    const ids = dagOrchestrationExpectations.map((expectation) => expectation.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const expectation of dagOrchestrationExpectations) {
      expect(expectation.id).toMatch(/^exp\.dag\.[a-z-]+$/);
      expect(expectation.id.length).toBeLessThanOrEqual(60);
      expect(expectation.archetypes).toEqual(['dag-orchestration']);
    }
  });

  it('covers every expectation in the verdict table exactly once', () => {
    expect(TABLE.map((row) => row.id).sort()).toEqual(
      dagOrchestrationExpectations.map((expectation) => expectation.id).sort(),
    );
  });

  it.each(TABLE)('$id: naive=$onNaive solid=$onSolid', ({ id, onNaive, onSolid }) => {
    const expectation = expectationById(id);
    for (const [fixture, expected] of [
      [naiveGraph, onNaive],
      [solidGraph, onSolid],
    ] as const) {
      const check = expectation.satisfiedBy(contextFor(fixture, dagFacts()));
      expect(check.met).toBe(expected);
      expect(check.evidenceNodeIds).toEqual([...check.evidenceNodeIds].sort());
      expect(check.evidenceEdgeIds).toEqual([...check.evidenceEdgeIds].sort());
    }
  });

  it('exp.dag.idempotent-steps: declared idempotent operations satisfy without the config knob', () => {
    const declared = graph([
      node('worker-1', 'worker', {
        label: 'Step worker',
        operations: [{ name: 'runStep', kind: 'command', idempotent: true }],
      }),
    ]);
    const check = expectationById('exp.dag.idempotent-steps').satisfiedBy(
      contextFor(declared, dagFacts()),
    );
    expect(check.met).toBe(true);
    expect(check.evidenceNodeIds).toEqual(['worker-1']);
  });

  it('grades the naive three-box no better than D', () => {
    const result = runEngine(naiveGraph, dagFacts());
    expect(GRADE_RANK[result.grade]).toBeLessThanOrEqual(GRADE_RANK.D);
  });

  it('grades the solid orchestrator at least a B', () => {
    const result = runEngine(solidGraph, dagFacts());
    expect(GRADE_RANK[result.grade]).toBeGreaterThanOrEqual(GRADE_RANK.B);
  });

  it('teaches on every unmet expectation — messages carry the lesson', () => {
    const result = runEngine(naiveGraph, dagFacts());
    const bankFindings = result.findings.filter((finding) =>
      finding.expectationId?.startsWith('exp.dag.'),
    );
    expect(bankFindings.length).toBeGreaterThan(0);
    for (const finding of bankFindings) {
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.message.length).toBeGreaterThan(20);
    }
  });

  it('suggestion patches introduce only suggested- ids and reference existing elements', () => {
    const ctx = contextFor(naiveGraph, dagFacts());
    const existingNodeIds = new Set(naiveGraph.nodes.map((graphNode) => graphNode.id));
    const existingEdgeIds = new Set(naiveGraph.edges.map((graphEdge) => graphEdge.id));
    const patches = dagOrchestrationExpectations.flatMap((expectation) => {
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
        } else if (op.op === 'remove-edge' || op.op === 'update-edge') {
          expect(existingEdgeIds.has(op.edgeId)).toBe(true);
        } else {
          expect(existingNodeIds.has(op.nodeId)).toBe(true);
        }
      }
    }
  });
});
