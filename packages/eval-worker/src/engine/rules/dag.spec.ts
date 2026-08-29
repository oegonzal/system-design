import { describe, expect, it } from 'vitest';

import { contextFor, dagFacts, edge, graph, node, ruleById, workflowFacts } from '../testing';

describe('dag.scheduler-does-the-work', () => {
  const rule = ruleById('dag.scheduler-does-the-work');
  const busybody = graph(
    [node('sched-1', 'scheduler'), node('ext-1', 'external-api'), node('store-1', 'object-store')],
    [edge('e1', 'sched-1', 'ext-1'), edge('e2', 'sched-1', 'store-1')],
  );

  it('fires when the scheduler makes synchronous data-plane calls', () => {
    const findings = rule.check(contextFor(busybody, dagFacts()));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].dimension).toBe('scalability');
    expect(findings[0].affectedNodeIds).toEqual(['ext-1', 'sched-1', 'store-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1', 'e2']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('allows the scheduler to checkpoint run-state in a database', () => {
    const checkpointing = graph(
      [node('sched-1', 'scheduler'), node('db-1', 'database')],
      [edge('e1', 'sched-1', 'db-1')],
    );
    expect(rule.check(contextFor(checkpointing, dagFacts()))).toEqual([]);
  });

  it('stays silent on async hand-offs', () => {
    const decoupled = graph(busybody.nodes, [
      edge('e1', 'sched-1', 'ext-1', 'async'),
      edge('e2', 'sched-1', 'store-1', 'async'),
    ]);
    expect(rule.check(contextFor(decoupled, dagFacts()))).toEqual([]);
  });

  it('fires outside dag orchestration too — the orchestrator kinds are the gate', () => {
    expect(rule.check(contextFor(busybody, workflowFacts()))).toHaveLength(1);
  });
});

describe('dag.sync-dispatch', () => {
  const rule = ruleById('dag.sync-dispatch');
  const directCall = graph(
    [node('engine-1', 'workflow-engine'), node('worker-1', 'worker')],
    [edge('e1', 'engine-1', 'worker-1')],
  );

  it('fires on synchronous dispatch and inserts the step queue', () => {
    const findings = rule.check(contextFor(directCall, dagFacts()));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].dimension).toBe('messaging');
    expect(findings[0].affectedNodeIds).toEqual(['engine-1', 'worker-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion?.ops).toEqual([
      {
        op: 'add-node',
        node: {
          id: 'suggested-queue-1',
          kind: 'queue',
          label: 'Step queue',
          config: { dlq: true },
        },
      },
      {
        op: 'add-edge',
        edge: {
          id: 'suggested-edge-dispatch-1',
          source: 'engine-1',
          target: 'suggested-queue-1',
          kind: 'async',
        },
      },
      {
        op: 'add-edge',
        edge: {
          id: 'suggested-edge-claim-1',
          source: 'suggested-queue-1',
          target: 'worker-1',
          kind: 'async',
        },
      },
      { op: 'remove-edge', edgeId: 'e1' },
    ]);
  });

  it('stays silent when dispatch already flows through a queue', () => {
    const queued = graph(
      [node('sched-1', 'scheduler'), node('q-1', 'queue'), node('worker-1', 'worker')],
      [edge('e1', 'sched-1', 'q-1', 'async'), edge('e2', 'q-1', 'worker-1', 'async')],
    );
    expect(rule.check(contextFor(queued, dagFacts()))).toEqual([]);
  });

  it('fires for a workflow-automation engine dispatching synchronously', () => {
    expect(rule.check(contextFor(directCall, workflowFacts()))).toHaveLength(1);
  });
});

describe('dag.dynamic-fanout-sync', () => {
  const rule = ruleById('dag.dynamic-fanout-sync');
  const advanced = dagFacts({ difficulty: 'advanced' });
  const wideStep = graph(
    [
      node('worker-1', 'worker'),
      node('svc-1', 'service'),
      node('svc-2', 'service'),
      node('svc-3', 'service'),
      node('svc-4', 'service'),
      node('svc-5', 'service'),
    ],
    [
      edge('e1', 'worker-1', 'svc-1'),
      edge('e2', 'worker-1', 'svc-2'),
      edge('e3', 'worker-1', 'svc-3'),
      edge('e4', 'worker-1', 'svc-4'),
      edge('e5', 'worker-1', 'svc-5'),
    ],
  );

  it('fires at advanced on a worker fanning out five synchronous calls', () => {
    const findings = rule.check(contextFor(wideStep, advanced));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].dimension).toBe('scalability');
    expect(findings[0].affectedNodeIds).toEqual(['worker-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
    // The patch adds the stream without ripping out the existing calls.
    expect(findings[0].suggestion?.ops).toEqual([
      {
        op: 'add-node',
        node: { id: 'suggested-event-stream-1', kind: 'event-stream', label: 'Fan-out stream' },
      },
      {
        op: 'add-edge',
        edge: {
          id: 'suggested-edge-fanout-1',
          source: 'worker-1',
          target: 'suggested-event-stream-1',
          kind: 'async',
        },
      },
    ]);
  });

  it('stays silent at four calls or when the fan-out is async', () => {
    const narrower = graph(wideStep.nodes, wideStep.edges.slice(0, 4));
    expect(rule.check(contextFor(narrower, advanced))).toEqual([]);
    const streamed = graph(
      wideStep.nodes,
      wideStep.edges.map((fanEdge) => ({ ...fanEdge, kind: 'async' as const })),
    );
    expect(rule.check(contextFor(streamed, advanced))).toEqual([]);
  });

  it('fires at advanced for other archetypes running a worker pool', () => {
    expect(
      rule.check(contextFor(wideStep, workflowFacts({ difficulty: 'advanced' }))),
    ).toHaveLength(1);
  });

  it('stays silent below advanced difficulty', () => {
    expect(rule.check(contextFor(wideStep, dagFacts()))).toEqual([]);
  });
});
