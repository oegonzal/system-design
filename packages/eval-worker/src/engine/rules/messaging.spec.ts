import { describe, expect, it } from 'vitest';

import { analyticsFacts, contextFor, edge, graph, node, ruleById } from '../testing';

describe('messaging.no-queue-for-spike', () => {
  const rule = ruleById('messaging.no-queue-for-spike');
  const unbuffered = graph(
    [node('client-1', 'client'), node('svc-1', 'service'), node('db-1', 'database')],
    [edge('e1', 'client-1', 'svc-1'), edge('e2', 'svc-1', 'db-1')],
  );

  it('fires on a flash sale whose writes hit the database unbuffered', () => {
    const findings = rule.check(contextFor(unbuffered));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].affectedNodeIds).toEqual(['client-1', 'db-1']);
    const ops = findings[0].suggestion?.ops ?? [];
    expect(ops[0]).toMatchObject({ op: 'add-node', node: { kind: 'queue' } });
    expect(ops).toContainEqual({
      op: 'add-edge',
      edge: {
        id: 'suggested-edge-enqueue-1',
        source: 'svc-1',
        target: 'suggested-queue-1',
        kind: 'async',
      },
    });
    expect(ops).toContainEqual({
      op: 'add-edge',
      edge: {
        id: 'suggested-edge-dequeue-1',
        source: 'suggested-queue-1',
        target: 'db-1',
        kind: 'async',
      },
    });
  });

  it('stays silent once any queue or event stream exists', () => {
    const withQueue = graph([...unbuffered.nodes, node('q-1', 'queue')], unbuffered.edges);
    expect(rule.check(contextFor(withQueue))).toEqual([]);
    const withStream = graph(
      [...unbuffered.nodes, node('stream-1', 'event-stream')],
      unbuffered.edges,
    );
    expect(rule.check(contextFor(withStream))).toEqual([]);
  });

  it('stays silent for other archetypes and when no client reaches a database', () => {
    expect(rule.check(contextFor(unbuffered, analyticsFacts()))).toEqual([]);
    const noPath = graph(
      [node('client-1', 'client'), node('svc-1', 'service'), node('db-1', 'database')],
      [edge('e1', 'client-1', 'svc-1')],
    );
    expect(rule.check(contextFor(noPath))).toEqual([]);
  });
});

describe('messaging.no-event-stream-fanout', () => {
  const rule = ruleById('messaging.no-event-stream-fanout');

  function producerWith(consumers: number, withStream = false) {
    const targets = Array.from({ length: consumers }, (_, i) => node(`w-${i + 1}`, 'worker'));
    const edges = targets.map((target, i) => edge(`e${i + 1}`, 'svc-1', target.id));
    const nodes = [node('svc-1', 'service'), ...targets];
    if (withStream) nodes.push(node('stream-1', 'event-stream'));
    return graph(nodes, edges);
  }

  it('fires when a producer pushes to three consumers point-to-point', () => {
    const findings = rule.check(contextFor(producerWith(3)));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['svc-1', 'w-1', 'w-2', 'w-3']);
  });

  it('stays silent when an event stream already exists', () => {
    expect(rule.check(contextFor(producerWith(3, true)))).toEqual([]);
  });

  it('stays silent at two consumers', () => {
    expect(rule.check(contextFor(producerWith(2)))).toEqual([]);
  });
});

describe('messaging.queue-no-dlq', () => {
  const rule = ruleById('messaging.queue-no-dlq');

  it('fires on a queue with no dead-letter configured', () => {
    const findings = rule.check(contextFor(graph([node('q-1', 'queue')])));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].suggestion?.ops[0]).toMatchObject({
      op: 'update-node',
      nodeId: 'q-1',
      set: { config: { dlq: true } },
    });
  });

  it('stays silent when dlq is enabled', () => {
    expect(
      rule.check(contextFor(graph([node('q-1', 'queue', { config: { dlq: true } })]))),
    ).toEqual([]);
  });

  it('stays silent when a second queue is attached', () => {
    const chained = graph(
      [node('q-1', 'queue'), node('q-dead', 'queue', { config: { dlq: true } })],
      [edge('e1', 'q-1', 'q-dead', 'async')],
    );
    expect(rule.check(contextFor(chained))).toEqual([]);
  });
});
