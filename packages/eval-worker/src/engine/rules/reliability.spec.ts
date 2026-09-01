import { describe, expect, it } from 'vitest';

import { contextFor, edge, flashSaleFacts, graph, node, ruleById, workflowFacts } from '../testing';

describe('reliability.single-db-no-replica', () => {
  const rule = ruleById('reliability.single-db-no-replica');
  const singleDb = graph(
    [node('svc-1', 'service'), node('db-1', 'database')],
    [edge('e1', 'svc-1', 'db-1')],
  );

  it('fires on a lone database when availability is required', () => {
    const findings = rule.check(contextFor(singleDb));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].affectedNodeIds).toEqual(['db-1']);
    expect(findings[0].suggestion?.ops[0]).toMatchObject({
      op: 'add-node',
      node: { id: 'suggested-replica-1', kind: 'replica' },
    });
  });

  it('stays silent when a replica sits next to the database', () => {
    const withReplica = graph(
      [node('db-1', 'database'), node('rep-1', 'replica')],
      [edge('e1', 'db-1', 'rep-1', 'async')],
    );
    expect(rule.check(contextFor(withReplica))).toEqual([]);
  });

  it('stays silent when the database itself runs multiple replicas', () => {
    const multi = graph([node('db-1', 'database', { config: { replicas: 3 } })]);
    expect(rule.check(contextFor(multi))).toEqual([]);
  });

  it('stays silent when availability is not a stated requirement', () => {
    expect(rule.check(contextFor(singleDb, flashSaleFacts({ nfrKinds: ['latency'] })))).toEqual([]);
  });
});

describe('reliability.service-no-lb', () => {
  const rule = ruleById('reliability.service-no-lb');

  it('fires when a client reaches a service with nothing spreading traffic', () => {
    const direct = graph(
      [node('client-1', 'client'), node('svc-1', 'service')],
      [edge('e1', 'client-1', 'svc-1')],
    );
    const findings = rule.check(contextFor(direct));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['client-1', 'svc-1']);
    expect(findings[0].suggestion?.ops).toContainEqual({ op: 'remove-edge', edgeId: 'e1' });
  });

  it('fires on an indirect path too, without a remove-edge op', () => {
    const viaCdn = graph(
      [node('client-1', 'client'), node('cdn-1', 'cdn'), node('svc-1', 'service')],
      [edge('e1', 'client-1', 'cdn-1'), edge('e2', 'cdn-1', 'svc-1')],
    );
    const findings = rule.check(contextFor(viaCdn));
    expect(findings).toHaveLength(1);
    expect(findings[0].suggestion?.ops.some((op) => op.op === 'remove-edge')).toBe(false);
  });

  it('stays silent when a load balancer or gateway fronts the service', () => {
    const balanced = graph(
      [node('client-1', 'client'), node('lb-1', 'load-balancer'), node('svc-1', 'service')],
      [edge('e1', 'client-1', 'lb-1'), edge('e2', 'lb-1', 'svc-1')],
    );
    expect(rule.check(contextFor(balanced))).toEqual([]);
    const gated = graph(
      [node('client-1', 'client'), node('gw-1', 'gateway'), node('svc-1', 'service')],
      [edge('e1', 'client-1', 'gw-1'), edge('e2', 'gw-1', 'svc-1')],
    );
    expect(rule.check(contextFor(gated))).toEqual([]);
  });
});

describe('reliability.lb-single-target', () => {
  const rule = ruleById('reliability.lb-single-target');

  it('fires when a balancer fronts one single-replica target', () => {
    const theater = graph(
      [node('lb-1', 'load-balancer'), node('svc-1', 'service')],
      [edge('e1', 'lb-1', 'svc-1')],
    );
    const findings = rule.check(contextFor(theater));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['lb-1', 'svc-1']);
  });

  it('stays silent when the single target actually has replicas', () => {
    const scaled = graph(
      [node('lb-1', 'load-balancer'), node('svc-1', 'service', { config: { replicas: 3 } })],
      [edge('e1', 'lb-1', 'svc-1')],
    );
    expect(rule.check(contextFor(scaled))).toEqual([]);
  });

  it('stays silent when the balancer has multiple targets', () => {
    const spread = graph(
      [node('lb-1', 'load-balancer'), node('svc-1', 'service'), node('svc-2', 'service')],
      [edge('e1', 'lb-1', 'svc-1'), edge('e2', 'lb-1', 'svc-2')],
    );
    expect(rule.check(contextFor(spread))).toEqual([]);
  });
});

describe('reliability.single-service-instance', () => {
  const rule = ruleById('reliability.single-service-instance');
  const fronted = graph(
    [node('client-1', 'client'), node('lb-1', 'load-balancer'), node('svc-1', 'service')],
    [edge('e1', 'client-1', 'lb-1'), edge('e2', 'lb-1', 'svc-1')],
  );

  it('fires on a fronted service running one instance', () => {
    const findings = rule.check(contextFor(fronted));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['svc-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'svc-1', set: { config: { replicas: 3 } } },
    ]);
  });

  it('stays silent once the service runs multiple replicas', () => {
    const scaled = graph(
      [
        node('client-1', 'client'),
        node('lb-1', 'load-balancer'),
        node('svc-1', 'service', { config: { replicas: 3 } }),
      ],
      fronted.edges,
    );
    expect(rule.check(contextFor(scaled))).toEqual([]);
  });

  it('stays silent for an unfronted service — that is service-no-lb territory', () => {
    const raw = graph(
      [node('client-1', 'client'), node('svc-1', 'service')],
      [edge('e1', 'client-1', 'svc-1')],
    );
    expect(rule.check(contextFor(raw))).toEqual([]);
  });

  it('stays silent at intro difficulty', () => {
    expect(rule.check(contextFor(fronted, flashSaleFacts({ difficulty: 'intro' })))).toEqual([]);
  });
});

describe('reliability.replica-not-wired', () => {
  const rule = ruleById('reliability.replica-not-wired');

  it('fires on a replica with no replication stream and wires it to the primary', () => {
    const stranded = graph(
      [node('db-1', 'database'), node('rep-1', 'replica'), node('svc-1', 'service')],
      [edge('e1', 'svc-1', 'rep-1')],
    );
    const findings = rule.check(contextFor(stranded));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['rep-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      {
        op: 'add-edge',
        edge: {
          id: 'suggested-edge-replication-1',
          source: 'db-1',
          target: 'rep-1',
          kind: 'async',
        },
      },
    ]);
  });

  it('skips the patch when no database exists to replicate from', () => {
    const orphan = graph(
      [node('rep-1', 'replica'), node('svc-1', 'service')],
      [edge('e1', 'svc-1', 'rep-1')],
    );
    const findings = rule.check(contextFor(orphan));
    expect(findings).toHaveLength(1);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent when the primary replicates into the replica', () => {
    const wired = graph(
      [node('db-1', 'database'), node('rep-1', 'replica')],
      [edge('e1', 'db-1', 'rep-1', 'async')],
    );
    expect(rule.check(contextFor(wired))).toEqual([]);
  });
});

describe('reliability.single-gateway-advanced', () => {
  const rule = ruleById('reliability.single-gateway-advanced');
  const singleFront = graph(
    [node('client-1', 'client'), node('gw-1', 'gateway'), node('svc-1', 'service')],
    [edge('e1', 'client-1', 'gw-1'), edge('e2', 'gw-1', 'svc-1')],
  );

  it('fires at advanced on the lone gateway front door', () => {
    const findings = rule.check(
      contextFor(singleFront, flashSaleFacts({ difficulty: 'advanced' })),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['gw-1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent below advanced difficulty', () => {
    expect(rule.check(contextFor(singleFront))).toEqual([]);
  });

  it('stays silent with two gateways or with no client', () => {
    const dual = graph(
      [...singleFront.nodes, node('gw-2', 'gateway')],
      [...singleFront.edges, edge('e3', 'client-1', 'gw-2')],
    );
    expect(rule.check(contextFor(dual, flashSaleFacts({ difficulty: 'advanced' })))).toEqual([]);
    const headless = graph(
      [node('gw-1', 'gateway'), node('svc-1', 'service')],
      [edge('e1', 'gw-1', 'svc-1')],
    );
    expect(rule.check(contextFor(headless, flashSaleFacts({ difficulty: 'advanced' })))).toEqual(
      [],
    );
  });
});

describe('reliability.circuit-breaker-missing', () => {
  const rule = ruleById('reliability.circuit-breaker-missing');
  const unguarded = graph(
    [node('svc-1', 'service'), node('ext-1', 'external-api')],
    [edge('e1', 'svc-1', 'ext-1')],
  );

  it('fires on a synchronous external call with no breaker', () => {
    const findings = rule.check(contextFor(unguarded));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['ext-1', 'svc-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'ext-1', set: { config: { circuitBreaker: true } } },
    ]);
  });

  it('stays silent when the breaker is on or the call is async', () => {
    const guarded = graph(
      [
        node('svc-1', 'service'),
        node('ext-1', 'external-api', { config: { circuitBreaker: true } }),
      ],
      [edge('e1', 'svc-1', 'ext-1')],
    );
    expect(rule.check(contextFor(guarded))).toEqual([]);
    const buffered = graph(unguarded.nodes, [edge('e1', 'svc-1', 'ext-1', 'async')]);
    expect(rule.check(contextFor(buffered))).toEqual([]);
  });

  it('stays silent at intro difficulty', () => {
    expect(rule.check(contextFor(unguarded, flashSaleFacts({ difficulty: 'intro' })))).toEqual([]);
  });
});

describe('reliability.deep-sync-no-timeouts', () => {
  const rule = ruleById('reliability.deep-sync-no-timeouts');
  const deep = graph(
    [
      node('client-1', 'client'),
      node('svc-1', 'service'),
      node('svc-2', 'service'),
      node('svc-3', 'service'),
      node('db-1', 'database'),
    ],
    [
      edge('e1', 'client-1', 'svc-1'),
      edge('e2', 'svc-1', 'svc-2'),
      edge('e3', 'svc-2', 'svc-3'),
      edge('e4', 'svc-3', 'db-1'),
    ],
  );

  it('fires at advanced on a four-hop synchronous chain', () => {
    const findings = rule.check(contextFor(deep, flashSaleFacts({ difficulty: 'advanced' })));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].message).toContain('4 hops');
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent on shorter chains and below advanced', () => {
    const shallow = graph(deep.nodes.slice(0, 4), deep.edges.slice(0, 3));
    expect(rule.check(contextFor(shallow, flashSaleFacts({ difficulty: 'advanced' })))).toEqual([]);
    expect(rule.check(contextFor(deep))).toEqual([]);
  });
});

describe('reliability.scheduler-single-point', () => {
  const rule = ruleById('reliability.scheduler-single-point');
  const loneTick = graph(
    [node('sched-1', 'scheduler'), node('q-1', 'queue')],
    [edge('e1', 'sched-1', 'q-1', 'async')],
  );

  it('fires when one orchestrator owns the tick with no leader election', () => {
    const findings = rule.check(contextFor(loneTick, workflowFacts()));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['sched-1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent once a distributed lock makes a standby safe', () => {
    const guarded = graph(
      [...loneTick.nodes, node('lock-1', 'distributed-lock')],
      [...loneTick.edges, edge('e2', 'sched-1', 'lock-1')],
    );
    expect(rule.check(contextFor(guarded, workflowFacts()))).toEqual([]);
  });

  it('fires outside the workflow archetypes too — the lone scheduler is the evidence', () => {
    expect(rule.check(contextFor(loneTick))).toHaveLength(1);
  });

  it('stays silent with two orchestrators', () => {
    const standby = graph(
      [...loneTick.nodes, node('sched-2', 'scheduler')],
      [...loneTick.edges, edge('e2', 'sched-2', 'q-1', 'async')],
    );
    expect(rule.check(contextFor(standby, workflowFacts()))).toEqual([]);
  });
});

describe('reliability.queue-producer-overload', () => {
  const rule = ruleById('reliability.queue-producer-overload');
  const funnel = graph(
    [
      node('svc-1', 'service'),
      node('svc-2', 'service'),
      node('svc-3', 'service'),
      node('q-1', 'queue'),
      node('worker-1', 'worker'),
    ],
    [
      edge('e1', 'svc-1', 'q-1', 'async'),
      edge('e2', 'svc-2', 'q-1', 'async'),
      edge('e3', 'svc-3', 'q-1', 'async'),
      edge('e4', 'q-1', 'worker-1', 'async'),
    ],
  );

  it('fires when three producers feed one consumer edge', () => {
    const findings = rule.check(contextFor(funnel));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].affectedNodeIds).toEqual(['q-1', 'svc-1', 'svc-2', 'svc-3']);
    expect(findings[0].affectedEdgeIds).toEqual(['e4']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent with fewer producers or more consumers', () => {
    const twoProducers = graph(
      funnel.nodes,
      funnel.edges.filter((e) => e.id !== 'e3'),
    );
    expect(rule.check(contextFor(twoProducers))).toEqual([]);
    const twoConsumers = graph(
      [...funnel.nodes, node('worker-2', 'worker')],
      [...funnel.edges, edge('e5', 'q-1', 'worker-2', 'async')],
    );
    expect(rule.check(contextFor(twoConsumers))).toEqual([]);
  });
});

describe('reliability.nothing-monitored', () => {
  const rule = ruleById('reliability.nothing-monitored');
  const observed = flashSaleFacts({ nfrKinds: ['availability', 'observability'] });
  const blind = graph(
    [node('gw-1', 'gateway'), node('svc-1', 'service')],
    [edge('e1', 'gw-1', 'svc-1')],
  );

  it('fires when observability is demanded and nothing watches the design', () => {
    const findings = rule.check(contextFor(blind, observed));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual([]);
    expect(findings[0].suggestion?.ops).toEqual([
      {
        op: 'add-node',
        node: { id: 'suggested-monitoring-1', kind: 'monitoring', label: 'Monitoring' },
      },
    ]);
  });

  it('stays silent once a monitoring block exists', () => {
    const watched = graph([...blind.nodes, node('mon-1', 'monitoring')], blind.edges);
    expect(rule.check(contextFor(watched, observed))).toEqual([]);
  });

  it('stays silent when observability is not a stated requirement', () => {
    expect(rule.check(contextFor(blind))).toEqual([]);
  });
});

describe('reliability.dlq-unmonitored', () => {
  const rule = ruleById('reliability.dlq-unmonitored');
  const observed = flashSaleFacts({ nfrKinds: ['availability', 'observability'] });
  const landfill = graph(
    [node('q-1', 'queue', { config: { dlq: true } }), node('worker-1', 'worker')],
    [edge('e1', 'q-1', 'worker-1', 'async')],
  );

  it('fires on a dead-letter queue with no monitoring block', () => {
    const findings = rule.check(contextFor(landfill, observed));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].affectedNodeIds).toEqual(['q-1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent once monitoring exists or no queue dead-letters', () => {
    const watched = graph([...landfill.nodes, node('mon-1', 'monitoring')], landfill.edges);
    expect(rule.check(contextFor(watched, observed))).toEqual([]);
    const bare = graph([node('q-1', 'queue'), node('worker-1', 'worker')], landfill.edges);
    expect(rule.check(contextFor(bare, observed))).toEqual([]);
  });

  it('stays silent when observability is not a stated requirement', () => {
    expect(rule.check(contextFor(landfill))).toEqual([]);
  });
});

describe('reliability.no-tracing-many-services', () => {
  const rule = ruleById('reliability.no-tracing-many-services');
  const sprawl = graph([
    node('svc-1', 'service'),
    node('svc-2', 'service'),
    node('worker-1', 'worker'),
    node('sp-1', 'stream-processor'),
    node('ml-1', 'ml-inference'),
  ]);

  it('fires on five compute nodes with no tracing', () => {
    const findings = rule.check(contextFor(sprawl));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].affectedNodeIds).toEqual(['ml-1', 'sp-1', 'svc-1', 'svc-2', 'worker-1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent once a tracing block exists', () => {
    const traced = graph([...sprawl.nodes, node('trace-1', 'tracing')]);
    expect(rule.check(contextFor(traced))).toEqual([]);
  });

  it('stays silent below five compute nodes', () => {
    const smaller = graph(sprawl.nodes.slice(0, 4));
    expect(rule.check(contextFor(smaller))).toEqual([]);
  });
});
