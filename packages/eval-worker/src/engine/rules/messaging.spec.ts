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

describe('messaging.pub-sub-single-subscriber', () => {
  const rule = ruleById('messaging.pub-sub-single-subscriber');

  it('fires on a topic that fans out to exactly one subscriber', () => {
    const lonely = graph(
      [node('svc-1', 'service'), node('topic-1', 'pub-sub'), node('worker-1', 'worker')],
      [edge('e1', 'svc-1', 'topic-1', 'async'), edge('e2', 'topic-1', 'worker-1', 'async')],
    );
    const findings = rule.check(contextFor(lonely));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].affectedNodeIds).toEqual(['topic-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e2']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent with real fan-out or no subscribers yet', () => {
    const fanned = graph(
      [
        node('svc-1', 'service'),
        node('topic-1', 'pub-sub'),
        node('worker-1', 'worker'),
        node('worker-2', 'worker'),
      ],
      [
        edge('e1', 'svc-1', 'topic-1', 'async'),
        edge('e2', 'topic-1', 'worker-1', 'async'),
        edge('e3', 'topic-1', 'worker-2', 'async'),
      ],
    );
    expect(rule.check(contextFor(fanned))).toEqual([]);
    const unwired = graph(
      [node('svc-1', 'service'), node('topic-1', 'pub-sub')],
      [edge('e1', 'svc-1', 'topic-1', 'async')],
    );
    expect(rule.check(contextFor(unwired))).toEqual([]);
  });
});

describe('messaging.cdc-dangling', () => {
  const rule = ruleById('messaging.cdc-dangling');

  it('fires when the connector has no sink for what it captures', () => {
    const deadEnd = graph(
      [node('db-1', 'database'), node('cdc-1', 'cdc-connector'), node('svc-1', 'service')],
      [edge('e1', 'db-1', 'cdc-1', 'async'), edge('e2', 'cdc-1', 'svc-1', 'async')],
    );
    const findings = rule.check(contextFor(deadEnd));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['cdc-1']);
    expect(findings[0].message).toContain('delivers it nowhere');
  });

  it('fires when no database feeds the connector', () => {
    const sourceless = graph(
      [node('cdc-1', 'cdc-connector'), node('stream-1', 'event-stream')],
      [edge('e1', 'cdc-1', 'stream-1', 'async')],
    );
    const findings = rule.check(contextFor(sourceless));
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('no database feeding it');
  });

  it('stays silent on a connector with both ends wired', () => {
    const wired = graph(
      [node('db-1', 'database'), node('cdc-1', 'cdc-connector'), node('search-1', 'search-index')],
      [edge('e1', 'db-1', 'cdc-1', 'async'), edge('e2', 'cdc-1', 'search-1', 'async')],
    );
    expect(rule.check(contextFor(wired))).toEqual([]);
  });
});

describe('messaging.notification-on-request-path', () => {
  const rule = ruleById('messaging.notification-on-request-path');

  it('fires on a synchronous call into the notification service', () => {
    const blocking = graph(
      [node('svc-1', 'service'), node('notify-1', 'notification-service')],
      [edge('e1', 'svc-1', 'notify-1')],
    );
    const findings = rule.check(contextFor(blocking));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['notify-1', 'svc-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent when dispatch is async or buffered through a queue', () => {
    const asyncDispatch = graph(
      [node('svc-1', 'service'), node('notify-1', 'notification-service')],
      [edge('e1', 'svc-1', 'notify-1', 'async')],
    );
    expect(rule.check(contextFor(asyncDispatch))).toEqual([]);
    const buffered = graph(
      [node('svc-1', 'service'), node('q-1', 'queue'), node('notify-1', 'notification-service')],
      [edge('e1', 'svc-1', 'q-1', 'async'), edge('e2', 'q-1', 'notify-1', 'async')],
    );
    expect(rule.check(contextFor(buffered))).toEqual([]);
  });
});

describe('messaging.payment-webhooks-direct', () => {
  const rule = ruleById('messaging.payment-webhooks-direct');

  it('fires when webhooks land straight on compute', () => {
    const direct = graph(
      [node('pay-1', 'payment-provider', { config: { webhooks: true } }), node('svc-1', 'service')],
      [edge('e1', 'pay-1', 'svc-1', 'async')],
    );
    const findings = rule.check(contextFor(direct));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['pay-1', 'svc-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent when webhooks land on a buffer first', () => {
    const buffered = graph(
      [
        node('pay-1', 'payment-provider', { config: { webhooks: true } }),
        node('q-1', 'queue'),
        node('worker-1', 'worker'),
      ],
      [edge('e1', 'pay-1', 'q-1', 'async'), edge('e2', 'q-1', 'worker-1', 'async')],
    );
    expect(rule.check(contextFor(buffered))).toEqual([]);
  });

  it('stays silent when the provider does not deliver webhooks', () => {
    const polling = graph(
      [node('pay-1', 'payment-provider'), node('svc-1', 'service')],
      [edge('e1', 'pay-1', 'svc-1', 'async')],
    );
    expect(rule.check(contextFor(polling))).toEqual([]);
  });
});
