import { describe, expect, it } from 'vitest';

import { SUGGESTED_ID_PREFIX, type CanvasGraph, type Grade } from '@sysdesign/contracts';

import { runEngine } from '../../../engine';
import { contextFor, edge, graph, node, workflowFacts } from '../../../testing';
import { expectationApplies } from '../types';
import { workflowAutomationExpectations } from './workflow';

const GRADE_RANK: Record<Grade, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };

/**
 * Facts whose prompt asks for delayed steps — the keyword that arms
 * exp.wfa.scheduler-for-delays. The default workflowFacts() never mentions
 * delays, so it doubles as the not-applicable case.
 */
const delayFacts = () => workflowFacts({ functionalCapabilities: ['scheduled-work'] });

/** The three-box starting point every author draws first. */
const naiveGraph: CanvasGraph = graph(
  [
    node('client-1', 'client', { label: 'Tenant console' }),
    node('service-1', 'service', { label: 'Automation service' }),
    node('database-1', 'database', { label: 'Runs DB' }),
  ],
  [edge('edge-1', 'client-1', 'service-1'), edge('edge-2', 'service-1', 'database-1')],
);

/**
 * The reference design that meets every intro and standard expectation:
 * triggers buffer on a per-tenant queue behind a gateway, idempotent
 * executors checkpoint runs into a backed-up state DB and call third parties
 * asynchronously with credentials from a vault, a scheduler owns delays
 * behind leader election, and monitoring watches.
 */
const solidGraph: CanvasGraph = graph(
  [
    node('client-1', 'client', { label: 'Tenant console' }),
    node('gateway-1', 'gateway', { label: 'API gateway' }),
    node('service-1', 'service', { label: 'Workflow API', config: { replicas: 3 } }),
    node('queue-1', 'queue', {
      label: 'Trigger queue',
      config: { dlq: true, ordering: 'per-key' },
    }),
    node('worker-1', 'worker', { label: 'Action executor', config: { idempotent: true } }),
    node('database-1', 'database', { label: 'Run-state DB', config: { backups: true } }),
    node('scheduler-1', 'scheduler', { label: 'Delay scheduler' }),
    node('distributed-lock-1', 'distributed-lock', { label: 'Leader election' }),
    node('secrets-manager-1', 'secrets-manager', { label: 'Credentials vault' }),
    node('external-api-1', 'external-api', { label: 'Third-party action API' }),
    node('monitoring-1', 'monitoring', { label: 'Run monitoring' }),
  ],
  [
    edge('edge-1', 'client-1', 'gateway-1'),
    edge('edge-2', 'gateway-1', 'service-1'),
    edge('edge-3', 'service-1', 'queue-1', 'async'),
    edge('edge-4', 'queue-1', 'worker-1', 'async'),
    edge('edge-5', 'worker-1', 'database-1'),
    edge('edge-6', 'service-1', 'database-1'),
    edge('edge-7', 'scheduler-1', 'queue-1', 'async'),
    edge('edge-8', 'worker-1', 'secrets-manager-1'),
    edge('edge-9', 'worker-1', 'external-api-1', 'async'),
    edge('edge-10', 'service-1', 'monitoring-1', 'async'),
    edge('edge-11', 'scheduler-1', 'distributed-lock-1'),
  ],
);

/** Expected `satisfiedBy` verdict per expectation on each fixture. */
const TABLE: Array<{ id: string; onNaive: boolean; onSolid: boolean }> = [
  { id: 'exp.wfa.trigger-intake-buffer', onNaive: false, onSolid: true },
  { id: 'exp.wfa.executor-workers', onNaive: false, onSolid: true },
  { id: 'exp.wfa.run-state-store', onNaive: false, onSolid: true },
  { id: 'exp.wfa.edge-front-door', onNaive: false, onSolid: true },
  { id: 'exp.wfa.retry-dlq', onNaive: false, onSolid: true },
  { id: 'exp.wfa.scheduler-for-delays', onNaive: false, onSolid: true },
  // With no external-api on the canvas there is nothing coupled synchronously.
  { id: 'exp.wfa.third-party-decoupled', onNaive: true, onSolid: true },
  { id: 'exp.wfa.credentials-scoped', onNaive: false, onSolid: true },
  { id: 'exp.wfa.tenant-observability', onNaive: false, onSolid: true },
  { id: 'exp.wfa.exactly-once-actions', onNaive: false, onSolid: true },
  { id: 'exp.wfa.tenant-isolation', onNaive: false, onSolid: true },
  { id: 'exp.wfa.multi-region-workers', onNaive: false, onSolid: false },
];

function expectationById(id: string) {
  const expectation = workflowAutomationExpectations.find((candidate) => candidate.id === id);
  if (!expectation) throw new Error(`unknown expectation: ${id}`);
  return expectation;
}

describe('workflow-automation expectation bank', () => {
  it('declares well-formed expectations gated to the archetype', () => {
    const ids = workflowAutomationExpectations.map((expectation) => expectation.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const expectation of workflowAutomationExpectations) {
      expect(expectation.id).toMatch(/^exp\.wfa\.[a-z-]+$/);
      expect(expectation.id.length).toBeLessThanOrEqual(60);
      expect(expectation.archetypes).toEqual(['workflow-automation']);
    }
  });

  it('covers every expectation in the verdict table exactly once', () => {
    expect(TABLE.map((row) => row.id).sort()).toEqual(
      workflowAutomationExpectations.map((expectation) => expectation.id).sort(),
    );
  });

  it.each(TABLE)('$id: naive=$onNaive solid=$onSolid', ({ id, onNaive, onSolid }) => {
    const expectation = expectationById(id);
    for (const [fixture, expected] of [
      [naiveGraph, onNaive],
      [solidGraph, onSolid],
    ] as const) {
      const check = expectation.satisfiedBy(contextFor(fixture, delayFacts()));
      expect(check.met).toBe(expected);
      expect(check.evidenceNodeIds).toEqual([...check.evidenceNodeIds].sort());
      expect(check.evidenceEdgeIds).toEqual([...check.evidenceEdgeIds].sort());
    }
  });

  it('exp.wfa.exactly-once-actions: declared idempotent operations satisfy without the config knob', () => {
    const declared = graph(
      [
        node('queue-1', 'queue', { label: 'Trigger queue' }),
        node('worker-1', 'worker', {
          label: 'Action executor',
          operations: [{ name: 'executeAction', kind: 'command', idempotent: true }],
        }),
      ],
      [edge('edge-1', 'queue-1', 'worker-1', 'async')],
    );
    const check = expectationById('exp.wfa.exactly-once-actions').satisfiedBy(
      contextFor(declared, workflowFacts()),
    );
    expect(check.met).toBe(true);
    expect(check.evidenceNodeIds).toEqual(['worker-1']);
  });

  it('grades the naive three-box no better than D', () => {
    const result = runEngine(naiveGraph, delayFacts());
    expect(GRADE_RANK[result.grade]).toBeLessThanOrEqual(GRADE_RANK.D);
  });

  it('grades the solid platform at least a B', () => {
    const result = runEngine(solidGraph, delayFacts());
    expect(GRADE_RANK[result.grade]).toBeGreaterThanOrEqual(GRADE_RANK.B);
  });

  it('grades delayed-step timers only when the prompt asks for them', () => {
    const expectation = expectationById('exp.wfa.scheduler-for-delays');
    expect(expectationApplies(expectation, delayFacts())).toBe(true);
    expect(expectationApplies(expectation, workflowFacts())).toBe(false);

    // Not applicable end to end: a schedulerless design loses nothing when
    // the prompt never mentions delays.
    const withoutDelays = runEngine(naiveGraph, workflowFacts());
    const findingIds = withoutDelays.findings.map((finding) => finding.expectationId);
    expect(findingIds).not.toContain('exp.wfa.scheduler-for-delays');
  });

  it('teaches on every unmet expectation — messages carry the lesson', () => {
    const result = runEngine(naiveGraph, delayFacts());
    const bankFindings = result.findings.filter((finding) =>
      finding.expectationId?.startsWith('exp.wfa.'),
    );
    expect(bankFindings.length).toBeGreaterThan(0);
    for (const finding of bankFindings) {
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.message.length).toBeGreaterThan(20);
    }
  });

  it('suggestion patches introduce only suggested- ids and reference existing elements', () => {
    const ctx = contextFor(naiveGraph, workflowFacts());
    const existingNodeIds = new Set(naiveGraph.nodes.map((graphNode) => graphNode.id));
    const existingEdgeIds = new Set(naiveGraph.edges.map((graphEdge) => graphEdge.id));
    const patches = workflowAutomationExpectations.flatMap((expectation) => {
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
