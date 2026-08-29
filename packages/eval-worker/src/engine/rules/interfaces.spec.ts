import { describe, expect, it } from 'vitest';

import type { NodeOperation } from '@sysdesign/contracts';

import {
  analyticsFacts,
  contextFor,
  edge,
  flashSaleFacts,
  graph,
  node,
  ruleById,
} from '../testing';

function op(name: string, kind: NodeOperation['kind'], idempotent?: boolean): NodeOperation {
  return { name, kind, ...(idempotent === undefined ? {} : { idempotent }) };
}

describe('hygiene.unspecified-interface', () => {
  const rule = ruleById('hygiene.unspecified-interface');
  const silentGateway = graph(
    [
      node('client-1', 'client'),
      node('gw-1', 'gateway'),
      node('svc-1', 'service', { operations: [op('placeOrder', 'command')] }),
    ],
    [edge('e1', 'client-1', 'gw-1'), edge('e2', 'gw-1', 'svc-1')],
  );

  it('fires at standard on an owner with edges but no declared operations', () => {
    const findings = rule.check(contextFor(silentGateway));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['gw-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('hardens to high at advanced and stays silent at intro', () => {
    const advanced = rule.check(
      contextFor(silentGateway, flashSaleFacts({ difficulty: 'advanced' })),
    );
    expect(advanced).toHaveLength(1);
    expect(advanced[0].severity).toBe('high');
    expect(rule.check(contextFor(silentGateway, flashSaleFacts({ difficulty: 'intro' })))).toEqual(
      [],
    );
  });

  it('also grades a silent channel owner', () => {
    const silentQueue = graph(
      [
        node('svc-1', 'service', { operations: [op('placeOrder', 'command')] }),
        node('q-1', 'queue'),
      ],
      [edge('e1', 'svc-1', 'q-1', 'async')],
    );
    const findings = rule.check(contextFor(silentQueue));
    expect(findings).toHaveLength(1);
    expect(findings[0].affectedNodeIds).toEqual(['q-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
  });

  it('stays silent when every owner declares, and when nobody declares at all', () => {
    const declared = graph(
      [
        node('client-1', 'client'),
        node('gw-1', 'gateway', { operations: [op('placeOrder', 'command')] }),
      ],
      [edge('e1', 'client-1', 'gw-1')],
    );
    expect(rule.check(contextFor(declared))).toEqual([]);
    // The feature gate: identical shape, but no node anywhere declares ops.
    const ungated = graph(
      [node('client-1', 'client'), node('gw-1', 'gateway')],
      [edge('e1', 'client-1', 'gw-1')],
    );
    expect(rule.check(contextFor(ungated))).toEqual([]);
  });
});

describe('hygiene.dangling-carries', () => {
  const rule = ruleById('hygiene.dangling-carries');
  const svc = node('svc-1', 'service', { operations: [op('getOrder', 'query')] });

  it('fires on a carried name the owner never declared', () => {
    const canvas = graph(
      [node('gw-1', 'gateway'), svc],
      [edge('e1', 'gw-1', 'svc-1', 'sync', ['getOrder', 'cancelOrder'])],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].message).toContain('"cancelOrder"');
    expect(findings[0].message).not.toContain('"getOrder"');
  });

  it('stays silent when every carry resolves', () => {
    const canvas = graph(
      [node('gw-1', 'gateway'), svc],
      [edge('e1', 'gw-1', 'svc-1', 'sync', ['getOrder'])],
    );
    expect(rule.check(contextFor(canvas))).toEqual([]);
  });

  it('stays silent on an ownerless edge and under the feature gate', () => {
    // service → database has no interface owner, so its carries resolve to nothing.
    const ownerless = graph(
      [svc, node('db-1', 'database')],
      [edge('e1', 'svc-1', 'db-1', 'sync', ['saveOrder'])],
    );
    expect(rule.check(contextFor(ownerless))).toEqual([]);
    const ungated = graph(
      [node('gw-1', 'gateway'), node('svc-2', 'service')],
      [edge('e1', 'gw-1', 'svc-2', 'sync', ['getOrder'])],
    );
    expect(rule.check(contextFor(ungated))).toEqual([]);
  });
});

describe('hygiene.unreferenced-operation', () => {
  const rule = ruleById('hygiene.unreferenced-operation');
  const svc = node('svc-1', 'service', {
    operations: [op('getOrder', 'query'), op('placeOrder', 'command')],
  });

  it('fires on a declared operation no touching edge carries', () => {
    const canvas = graph(
      [node('gw-1', 'gateway'), svc],
      [edge('e1', 'gw-1', 'svc-1', 'sync', ['getOrder'])],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].affectedNodeIds).toEqual(['svc-1']);
    expect(findings[0].message).toContain('"placeOrder"');
  });

  it('stays silent when no edge in the graph uses carries', () => {
    const unannotated = graph([node('gw-1', 'gateway'), svc], [edge('e1', 'gw-1', 'svc-1')]);
    expect(rule.check(contextFor(unannotated))).toEqual([]);
  });

  it('stays silent when every operation is referenced', () => {
    const covered = graph(
      [node('gw-1', 'gateway'), svc],
      [edge('e1', 'gw-1', 'svc-1', 'sync', ['getOrder', 'placeOrder'])],
    );
    expect(rule.check(contextFor(covered))).toEqual([]);
  });
});

describe('hygiene.srp-overload', () => {
  const rule = ruleById('hygiene.srp-overload');

  it('fires on an api node with more than three responsibilities', () => {
    const canvas = graph([
      node('svc-1', 'service', {
        operations: [op('getOrder', 'query')],
        responsibilities: ['orders', 'payments', 'inventory', 'emails'],
      }),
    ]);
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].affectedNodeIds).toEqual(['svc-1']);
    expect(findings[0].message).toContain('4 responsibilities');
  });

  it('fires on an api node with more than eight operations', () => {
    const wide = Array.from({ length: 9 }, (_, i) => op(`op-${i}`, 'query'));
    const canvas = graph([node('svc-1', 'service', { operations: wide })]);
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('9 operations');
  });

  it('stays silent at the limits and under the feature gate', () => {
    const atLimit = graph([
      node('svc-1', 'service', {
        operations: Array.from({ length: 8 }, (_, i) => op(`op-${i}`, 'query')),
        responsibilities: ['a', 'b', 'c'],
      }),
    ]);
    expect(rule.check(contextFor(atLimit))).toEqual([]);
    // Responsibilities alone do not pass the pack's operations gate.
    const ungated = graph([node('svc-1', 'service', { responsibilities: ['a', 'b', 'c', 'd'] })]);
    expect(rule.check(contextFor(ungated))).toEqual([]);
  });
});

describe('hygiene.responsibility-overlap', () => {
  const rule = ruleById('hygiene.responsibility-overlap');

  it('fires when two nodes claim the same responsibility, ignoring case and whitespace', () => {
    const canvas = graph([
      node('svc-1', 'service', { responsibilities: ['Owns order lifecycle'] }),
      node('svc-2', 'service', { responsibilities: ['  owns ORDER lifecycle '] }),
    ]);
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].affectedNodeIds).toEqual(['svc-1', 'svc-2']);
  });

  it('stays silent on distinct responsibilities and on a node repeating itself', () => {
    const distinct = graph([
      node('svc-1', 'service', { responsibilities: ['owns orders'] }),
      node('svc-2', 'service', { responsibilities: ['owns payments'] }),
    ]);
    expect(rule.check(contextFor(distinct))).toEqual([]);
    const selfRepeat = graph([
      node('svc-1', 'service', { responsibilities: ['owns orders', 'Owns orders'] }),
    ]);
    expect(rule.check(contextFor(selfRepeat))).toEqual([]);
  });
});

describe('messaging.event-over-sync', () => {
  const rule = ruleById('messaging.event-over-sync');
  const stream = node('stream-1', 'event-stream', { operations: [op('orderPlaced', 'event')] });

  it('fires on a sync edge carrying a declared event and patches it async', () => {
    const canvas = graph(
      [node('svc-1', 'service'), stream],
      [edge('e1', 'svc-1', 'stream-1', 'sync', ['orderPlaced'])],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['stream-1', 'svc-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-edge', edgeId: 'e1', set: { kind: 'async' } },
    ]);
  });

  it('stays silent on async delivery and on carried commands', () => {
    const asyncDelivery = graph(
      [node('svc-1', 'service'), stream],
      [edge('e1', 'svc-1', 'stream-1', 'async', ['orderPlaced'])],
    );
    expect(rule.check(contextFor(asyncDelivery))).toEqual([]);
    const command = graph(
      [
        node('gw-1', 'gateway'),
        node('svc-1', 'service', { operations: [op('placeOrder', 'command')] }),
      ],
      [edge('e1', 'gw-1', 'svc-1', 'sync', ['placeOrder'])],
    );
    expect(rule.check(contextFor(command))).toEqual([]);
  });
});

describe('messaging.query-over-async', () => {
  const rule = ruleById('messaging.query-over-async');
  const svc = node('svc-1', 'service', {
    operations: [op('getOrder', 'query'), op('placeOrder', 'command')],
  });

  it('fires on an async edge carrying a declared query and patches it sync', () => {
    const canvas = graph(
      [node('gw-1', 'gateway'), svc],
      [edge('e1', 'gw-1', 'svc-1', 'async', ['getOrder'])],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-edge', edgeId: 'e1', set: { kind: 'sync' } },
    ]);
  });

  it('stays silent on synchronous queries and fire-and-forget commands', () => {
    const syncQuery = graph(
      [node('gw-1', 'gateway'), svc],
      [edge('e1', 'gw-1', 'svc-1', 'sync', ['getOrder'])],
    );
    expect(rule.check(contextFor(syncQuery))).toEqual([]);
    const asyncCommand = graph(
      [node('gw-1', 'gateway'), svc],
      [edge('e1', 'gw-1', 'svc-1', 'async', ['placeOrder'])],
    );
    expect(rule.check(contextFor(asyncCommand))).toEqual([]);
  });
});

describe('messaging.non-idempotent-consumer', () => {
  const rule = ruleById('messaging.non-idempotent-consumer');
  const consumerGraph = (operation: NodeOperation, delivery?: string) =>
    graph(
      [
        node('q-1', 'queue', {
          operations: [operation],
          ...(delivery ? { config: { delivery } } : {}),
        }),
        node('worker-1', 'worker'),
      ],
      [edge('e1', 'q-1', 'worker-1', 'async', [operation.name])],
    );

  it('fires high when the carried command is declared non-idempotent', () => {
    const findings = rule.check(contextFor(consumerGraph(op('chargeOrder', 'command', false))));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['worker-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
  });

  it('fires info when idempotency is simply undeclared', () => {
    const findings = rule.check(contextFor(consumerGraph(op('chargeOrder', 'command'))));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
  });

  it('stays silent when the operation is declared idempotent', () => {
    expect(rule.check(contextFor(consumerGraph(op('chargeOrder', 'command', true))))).toEqual([]);
  });

  it('stays silent on an at-most-once channel', () => {
    expect(
      rule.check(contextFor(consumerGraph(op('chargeOrder', 'command', false), 'at-most-once'))),
    ).toEqual([]);
  });
});

describe('messaging.event-published-nowhere', () => {
  const rule = ruleById('messaging.event-published-nowhere');

  it('fires on a channel declaring events with no out-edges', () => {
    const canvas = graph(
      [
        node('svc-1', 'service'),
        node('stream-1', 'event-stream', { operations: [op('orderPlaced', 'event')] }),
      ],
      [edge('e1', 'svc-1', 'stream-1', 'async')],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['stream-1']);
  });

  it('stays silent once a consumer exists, or when the channel declares only commands', () => {
    const consumed = graph(
      [
        node('svc-1', 'service'),
        node('stream-1', 'event-stream', { operations: [op('orderPlaced', 'event')] }),
        node('worker-1', 'worker'),
      ],
      [edge('e1', 'svc-1', 'stream-1', 'async'), edge('e2', 'stream-1', 'worker-1', 'async')],
    );
    expect(rule.check(contextFor(consumed))).toEqual([]);
    const commandsOnly = graph(
      [
        node('svc-1', 'service'),
        node('q-1', 'queue', { operations: [op('resizeImage', 'command')] }),
      ],
      [edge('e1', 'svc-1', 'q-1', 'async')],
    );
    expect(rule.check(contextFor(commandsOnly))).toEqual([]);
  });
});

describe('messaging.command-fanout', () => {
  const rule = ruleById('messaging.command-fanout');

  it('fires when one command rides two distinct consumer edges', () => {
    const canvas = graph(
      [
        node('q-1', 'queue', { operations: [op('processPayment', 'command')] }),
        node('worker-1', 'worker'),
        node('worker-2', 'worker'),
      ],
      [
        edge('e1', 'q-1', 'worker-1', 'async', ['processPayment']),
        edge('e2', 'q-1', 'worker-2', 'async', ['processPayment']),
      ],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedEdgeIds).toEqual(['e1', 'e2']);
  });

  it('lets events fan out and single-consumer commands pass', () => {
    const events = graph(
      [
        node('topic-1', 'pub-sub', { operations: [op('orderPlaced', 'event')] }),
        node('worker-1', 'worker'),
        node('worker-2', 'worker'),
      ],
      [
        edge('e1', 'topic-1', 'worker-1', 'async', ['orderPlaced']),
        edge('e2', 'topic-1', 'worker-2', 'async', ['orderPlaced']),
      ],
    );
    expect(rule.check(contextFor(events))).toEqual([]);
    const singleOwner = graph(
      [
        node('q-1', 'queue', { operations: [op('processPayment', 'command')] }),
        node('worker-1', 'worker'),
      ],
      [edge('e1', 'q-1', 'worker-1', 'async', ['processPayment'])],
    );
    expect(rule.check(contextFor(singleOwner))).toEqual([]);
  });
});

describe('performance.query-on-write-path', () => {
  const rule = ruleById('performance.query-on-write-path');
  const cqrsless = graph(
    [
      node('svc-1', 'service', {
        operations: [op('placeOrder', 'command'), op('getOrder', 'query')],
      }),
      node('db-1', 'database'),
    ],
    [edge('e1', 'svc-1', 'db-1')],
  );

  it('fires on a read-heavy prompt when commands and queries share one unshielded store', () => {
    // flash-sale facts run 95:5 — comfortably past the 0.9 reads threshold.
    const findings = rule.check(contextFor(cqrsless));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['db-1', 'svc-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
  });

  it('stays silent when a cache or replica shields the path', () => {
    const withCache = graph(
      [...cqrsless.nodes, node('cache-1', 'cache')],
      [...cqrsless.edges, edge('e2', 'svc-1', 'cache-1')],
    );
    expect(rule.check(contextFor(withCache))).toEqual([]);
    const withReplica = graph(
      [...cqrsless.nodes, node('replica-1', 'replica')],
      [...cqrsless.edges, edge('e2', 'db-1', 'replica-1', 'async')],
    );
    expect(rule.check(contextFor(withReplica))).toEqual([]);
  });

  it('needs the read-heavy ratio and both verb kinds', () => {
    // analytics facts run 70:30 — under the threshold.
    expect(rule.check(contextFor(cqrsless, analyticsFacts()))).toEqual([]);
    const queriesOnly = graph(
      [
        node('svc-1', 'service', { operations: [op('getOrder', 'query')] }),
        node('db-1', 'database'),
      ],
      [edge('e1', 'svc-1', 'db-1')],
    );
    expect(rule.check(contextFor(queriesOnly))).toEqual([]);
  });
});

describe('security.ungated-commands', () => {
  const rule = ruleById('security.ungated-commands');
  const svc = node('svc-1', 'service', {
    operations: [op('placeOrder', 'command'), op('getOrder', 'query')],
  });

  it('fires when a client sends a declared command around the gateway', () => {
    const canvas = graph(
      [node('client-1', 'client'), node('gw-1', 'gateway'), svc],
      [edge('e1', 'client-1', 'gw-1'), edge('e2', 'client-1', 'svc-1', 'sync', ['placeOrder'])],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedEdgeIds).toEqual(['e2']);
  });

  it('stays silent for queries around the gateway and commands through it', () => {
    const reads = graph(
      [node('client-1', 'client'), node('gw-1', 'gateway'), svc],
      [edge('e1', 'client-1', 'gw-1'), edge('e2', 'client-1', 'svc-1', 'sync', ['getOrder'])],
    );
    expect(rule.check(contextFor(reads))).toEqual([]);
    const fronted = graph(
      [
        node('client-1', 'client'),
        node('gw-1', 'gateway', { operations: [op('placeOrder', 'command')] }),
      ],
      [edge('e1', 'client-1', 'gw-1', 'sync', ['placeOrder'])],
    );
    expect(rule.check(contextFor(fronted))).toEqual([]);
  });

  it('stays silent when no gateway exists to bypass', () => {
    const gatewayless = graph(
      [node('client-1', 'client'), svc],
      [edge('e1', 'client-1', 'svc-1', 'sync', ['placeOrder'])],
    );
    expect(rule.check(contextFor(gatewayless))).toEqual([]);
  });
});

describe('hygiene.op-kind-mismatch', () => {
  const rule = ruleById('hygiene.op-kind-mismatch');

  it('fires on an operation kind the node kind cannot serve', () => {
    // A worker serves only commands — the query is residue of a kind switch.
    const canvas = graph([node('worker-1', 'worker', { operations: [op('getStatus', 'query')] })]);
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].affectedNodeIds).toEqual(['worker-1']);
    expect(findings[0].message).toContain('"getStatus" (query)');
  });

  it('fires on storage declaring anything and stays silent on a legal surface', () => {
    const storage = graph([node('db-1', 'database', { operations: [op('saveOrder', 'command')] })]);
    expect(rule.check(contextFor(storage))).toHaveLength(1);
    const legal = graph([
      node('svc-1', 'service', {
        operations: [op('placeOrder', 'command'), op('getOrder', 'query')],
      }),
    ]);
    expect(rule.check(contextFor(legal))).toEqual([]);
  });
});

describe('data.client-command-not-idempotent', () => {
  const rule = ruleById('data.client-command-not-idempotent');
  const svcWith = (idempotent?: boolean) =>
    node('svc-1', 'service', { operations: [op('purchase', 'command', idempotent)] });

  it('fires on a client edge carrying a command not declared idempotent', () => {
    const canvas = graph(
      [node('client-1', 'client'), svcWith()],
      [edge('e1', 'client-1', 'svc-1', 'sync', ['purchase'])],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
  });

  it('follows the buyer through a client-fed gateway', () => {
    const canvas = graph(
      [node('client-1', 'client'), node('gw-1', 'gateway'), svcWith(false)],
      [edge('e1', 'client-1', 'gw-1'), edge('e2', 'gw-1', 'svc-1', 'sync', ['purchase'])],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].affectedEdgeIds).toEqual(['e2']);
  });

  it('stays silent when keyed, off the buyer path, or outside the archetype', () => {
    const keyed = graph(
      [node('client-1', 'client'), svcWith(true)],
      [edge('e1', 'client-1', 'svc-1', 'sync', ['purchase'])],
    );
    expect(rule.check(contextFor(keyed))).toEqual([]);
    const internal = graph(
      [node('svc-0', 'service'), svcWith()],
      [edge('e1', 'svc-0', 'svc-1', 'sync', ['purchase'])],
    );
    expect(rule.check(contextFor(internal))).toEqual([]);
    const offArchetype = graph(
      [node('client-1', 'client'), svcWith()],
      [edge('e1', 'client-1', 'svc-1', 'sync', ['purchase'])],
    );
    expect(rule.check(contextFor(offArchetype, analyticsFacts()))).toEqual([]);
  });
});

describe('hygiene.chatty-interface', () => {
  const rule = ruleById('hygiene.chatty-interface');
  const surface = (queries: number, commands: number) => [
    ...Array.from({ length: queries }, (_, i) => op(`get-${i}`, 'query')),
    ...Array.from({ length: commands }, (_, i) => op(`do-${i}`, 'command')),
  ];
  const carryAll = (ops: NodeOperation[]) => ops.map((operation) => operation.name);

  it('fires on one edge carrying six operations of mixed kinds', () => {
    const ops = surface(5, 1);
    const canvas = graph(
      [node('gw-1', 'gateway'), node('svc-1', 'service', { operations: ops })],
      [edge('e1', 'gw-1', 'svc-1', 'sync', carryAll(ops))],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
  });

  it('stays silent below six operations or within a single kind', () => {
    const narrow = surface(4, 1);
    const fiveOps = graph(
      [node('gw-1', 'gateway'), node('svc-1', 'service', { operations: narrow })],
      [edge('e1', 'gw-1', 'svc-1', 'sync', carryAll(narrow))],
    );
    expect(rule.check(contextFor(fiveOps))).toEqual([]);
    const uniform = surface(6, 0);
    const oneKind = graph(
      [node('gw-1', 'gateway'), node('svc-1', 'service', { operations: uniform })],
      [edge('e1', 'gw-1', 'svc-1', 'sync', carryAll(uniform))],
    );
    expect(rule.check(contextFor(oneKind))).toEqual([]);
  });
});

describe('messaging.stream-op-no-stream', () => {
  const rule = ruleById('messaging.stream-op-no-stream');
  const tailed = graph(
    [
      node('svc-1', 'service'),
      node('sp-1', 'stream-processor', { operations: [op('tailMetrics', 'stream')] }),
    ],
    [edge('e1', 'svc-1', 'sp-1', 'sync', ['tailMetrics'])],
  );

  it('fires when a stream op is carried and nothing can stream', () => {
    const findings = rule.check(contextFor(tailed));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].message).toContain('"tailMetrics"');
  });

  it('stays silent once a streaming substrate exists, or with no stream ops carried', () => {
    const withStream = graph(
      [...tailed.nodes, node('stream-1', 'event-stream')],
      [...tailed.edges, edge('e2', 'sp-1', 'stream-1', 'async')],
    );
    expect(rule.check(contextFor(withStream))).toEqual([]);
    const commandsOnly = graph(
      [
        node('svc-1', 'service'),
        node('sp-1', 'stream-processor', { operations: [op('recompute', 'command')] }),
      ],
      [edge('e1', 'svc-1', 'sp-1', 'sync', ['recompute'])],
    );
    expect(rule.check(contextFor(commandsOnly))).toEqual([]);
  });
});

describe('data.command-into-two-stores', () => {
  const rule = ruleById('data.command-into-two-stores');

  it('fires when one command name is carried into two databases', () => {
    const canvas = graph(
      [
        node('q-1', 'queue', { operations: [op('applyOrder', 'command')] }),
        node('db-1', 'database'),
        node('db-2', 'database'),
      ],
      [
        edge('e1', 'q-1', 'db-1', 'async', ['applyOrder']),
        edge('e2', 'q-1', 'db-2', 'async', ['applyOrder']),
      ],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedEdgeIds).toEqual(['e1', 'e2']);
  });

  it('stays silent for one store per command and for fanned-out events', () => {
    const partitioned = graph(
      [
        node('q-1', 'queue', {
          operations: [op('applyOrder', 'command'), op('applyRefund', 'command')],
        }),
        node('db-1', 'database'),
        node('db-2', 'database'),
      ],
      [
        edge('e1', 'q-1', 'db-1', 'async', ['applyOrder']),
        edge('e2', 'q-1', 'db-2', 'async', ['applyRefund']),
      ],
    );
    expect(rule.check(contextFor(partitioned))).toEqual([]);
    const events = graph(
      [
        node('stream-1', 'event-stream', { operations: [op('orderPlaced', 'event')] }),
        node('db-1', 'database'),
        node('db-2', 'database'),
      ],
      [
        edge('e1', 'stream-1', 'db-1', 'async', ['orderPlaced']),
        edge('e2', 'stream-1', 'db-2', 'async', ['orderPlaced']),
      ],
    );
    expect(rule.check(contextFor(events))).toEqual([]);
  });
});

describe('data.replica-receives-commands', () => {
  const rule = ruleById('data.replica-receives-commands');

  it('fires when a declared command is carried into a replica', () => {
    const canvas = graph(
      [
        node('q-1', 'queue', { operations: [op('applyOrder', 'command')] }),
        node('replica-1', 'replica'),
      ],
      [edge('e1', 'q-1', 'replica-1', 'async', ['applyOrder'])],
    );
    const findings = rule.check(contextFor(canvas));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['replica-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
  });

  it('stays silent for carried events and unresolvable carries', () => {
    const events = graph(
      [
        node('q-1', 'queue', { operations: [op('orderPlaced', 'event')] }),
        node('replica-1', 'replica'),
      ],
      [edge('e1', 'q-1', 'replica-1', 'async', ['orderPlaced'])],
    );
    expect(rule.check(contextFor(events))).toEqual([]);
    // service → replica has no interface owner: the carry proves nothing.
    const ownerless = graph(
      [
        node('svc-1', 'service', { operations: [op('placeOrder', 'command')] }),
        node('replica-1', 'replica'),
      ],
      [edge('e1', 'svc-1', 'replica-1', 'sync', ['placeOrder'])],
    );
    expect(rule.check(contextFor(ownerless))).toEqual([]);
  });
});
