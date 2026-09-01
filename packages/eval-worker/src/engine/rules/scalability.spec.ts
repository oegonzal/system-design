import { describe, expect, it } from 'vitest';

import { contextFor, edge, flashSaleFacts, graph, mediaFacts, node, ruleById } from '../testing';

function readHeavyFacts(readWriteRatio = '95:5') {
  return flashSaleFacts({
    scaleTargets: { ...flashSaleFacts().scaleTargets, readWriteRatio },
  });
}

describe('scalability.no-cache-read-heavy', () => {
  const rule = ruleById('scalability.no-cache-read-heavy');
  const uncached = graph(
    [node('client-1', 'client'), node('svc-1', 'service'), node('db-1', 'database')],
    [edge('e1', 'client-1', 'svc-1'), edge('e2', 'svc-1', 'db-1')],
  );

  it('fires on a read-heavy path with no cache, hanging the cache off the service', () => {
    const findings = rule.check(contextFor(uncached, readHeavyFacts()));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['client-1', 'db-1']);
    expect(findings[0].suggestion?.ops).toContainEqual({
      op: 'add-edge',
      edge: {
        id: 'suggested-edge-cache-1',
        source: 'svc-1',
        target: 'suggested-cache-1',
        kind: 'sync',
      },
    });
  });

  it('stays silent when a cache sits on the read path', () => {
    const cached = graph(
      [
        node('client-1', 'client'),
        node('svc-1', 'service'),
        node('cache-1', 'cache'),
        node('db-1', 'database'),
      ],
      [
        edge('e1', 'client-1', 'svc-1'),
        edge('e2', 'svc-1', 'cache-1'),
        edge('e3', 'cache-1', 'db-1'),
      ],
    );
    expect(rule.check(contextFor(cached, readHeavyFacts()))).toEqual([]);
  });

  it('stays silent when the workload is not read-heavy', () => {
    expect(rule.check(contextFor(uncached, readHeavyFacts('50:50')))).toEqual([]);
  });
});

describe('scalability.sync-to-slow-consumer', () => {
  const rule = ruleById('scalability.sync-to-slow-consumer');

  it('fires on a sync service→worker call and suggests inserting a queue', () => {
    const chained = graph(
      [node('svc-1', 'service'), node('worker-1', 'worker')],
      [edge('e1', 'svc-1', 'worker-1')],
    );
    const findings = rule.check(contextFor(chained));
    expect(findings).toHaveLength(1);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion?.ops).toContainEqual({ op: 'remove-edge', edgeId: 'e1' });
  });

  it('fires on a sync call into an external API', () => {
    const external = graph(
      [node('svc-1', 'service'), node('ext-1', 'external-api')],
      [edge('e1', 'svc-1', 'ext-1')],
    );
    expect(rule.check(contextFor(external))).toHaveLength(1);
  });

  it('stays silent when the call is already async or buffered', () => {
    const asyncCall = graph(
      [node('svc-1', 'service'), node('worker-1', 'worker')],
      [edge('e1', 'svc-1', 'worker-1', 'async')],
    );
    expect(rule.check(contextFor(asyncCall))).toEqual([]);
    const buffered = graph(
      [node('svc-1', 'service'), node('q-1', 'queue'), node('worker-1', 'worker')],
      [edge('e1', 'svc-1', 'q-1', 'async'), edge('e2', 'q-1', 'worker-1', 'async')],
    );
    expect(rule.check(contextFor(buffered))).toEqual([]);
  });
});

describe('scalability.shared-db-many-services', () => {
  const rule = ruleById('scalability.shared-db-many-services');

  it('fires when three services write into one database', () => {
    const shared = graph(
      [
        node('svc-1', 'service'),
        node('svc-2', 'service'),
        node('svc-3', 'service'),
        node('db-1', 'database'),
      ],
      [edge('e1', 'svc-1', 'db-1'), edge('e2', 'svc-2', 'db-1'), edge('e3', 'svc-3', 'db-1')],
    );
    const findings = rule.check(contextFor(shared));
    expect(findings).toHaveLength(1);
    expect(findings[0].affectedNodeIds).toEqual(['db-1', 'svc-1', 'svc-2', 'svc-3']);
  });

  it('stays silent with only two services', () => {
    const pair = graph(
      [node('svc-1', 'service'), node('svc-2', 'service'), node('db-1', 'database')],
      [edge('e1', 'svc-1', 'db-1'), edge('e2', 'svc-2', 'db-1')],
    );
    expect(rule.check(contextFor(pair))).toEqual([]);
  });
});

describe('scalability.unbounded-fanout', () => {
  const rule = ruleById('scalability.unbounded-fanout');

  function fanout(count: number) {
    const targets = Array.from({ length: count }, (_, i) => node(`svc-${i + 2}`, 'service'));
    const edges = targets.map((target, i) => edge(`e${i + 1}`, 'svc-1', target.id));
    return graph([node('svc-1', 'service'), ...targets], edges);
  }

  it('fires when a node makes more than four synchronous calls', () => {
    const findings = rule.check(contextFor(fanout(5)));
    expect(findings).toHaveLength(1);
    expect(findings[0].affectedNodeIds).toEqual(['svc-1']);
    expect(findings[0].suggestion?.ops[0]).toMatchObject({
      op: 'add-node',
      node: { kind: 'event-stream' },
    });
  });

  it('stays silent at four synchronous calls', () => {
    expect(rule.check(contextFor(fanout(4)))).toEqual([]);
  });
});

describe('scalability.capacity-replicas-insufficient', () => {
  const rule = ruleById('scalability.capacity-replicas-insufficient');
  const fronted = graph(
    [node('client-1', 'client'), node('lb-1', 'load-balancer'), node('svc-1', 'service')],
    [edge('e1', 'client-1', 'lb-1'), edge('e2', 'lb-1', 'svc-1')],
  );

  it('fires when replicas × per-replica rate falls short of the peak', () => {
    // 8,000 req/s against 1 × 3,000 req/s of assumed capacity.
    const findings = rule.check(contextFor(fronted));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['svc-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'svc-1', set: { config: { replicas: 3 } } },
    ]);
  });

  it('stays silent once the tier is sized for the peak', () => {
    const sized = graph(
      [
        node('client-1', 'client'),
        node('lb-1', 'load-balancer'),
        node('svc-1', 'service', { config: { replicas: 3 } }),
      ],
      fronted.edges,
    );
    expect(rule.check(contextFor(sized))).toEqual([]);
  });

  it('stays silent for unfronted services — the balancer lesson comes first', () => {
    const raw = graph(
      [node('client-1', 'client'), node('svc-1', 'service')],
      [edge('e1', 'client-1', 'svc-1')],
    );
    expect(rule.check(contextFor(raw))).toEqual([]);
  });
});

describe('scalability.db-write-bottleneck', () => {
  const rule = ruleById('scalability.db-write-bottleneck');
  const writeHeavyFacts = flashSaleFacts({
    scaleTargets: { ...flashSaleFacts().scaleTargets, readWriteRatio: '20:80' },
  });
  const unbuffered = graph(
    [node('svc-1', 'service'), node('db-1', 'database')],
    [edge('e1', 'svc-1', 'db-1')],
  );

  it('fires when write volume hits an unsharded primary with no buffer', () => {
    // 8,000 req/s at 20:80 is 6,400 writes/s.
    const findings = rule.check(contextFor(unbuffered, writeHeavyFacts));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['db-1']);
    expect(findings[0].message).toContain('6,400 writes/s');
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent when a queue buffers the write path or the store is sharded', () => {
    const buffered = graph(
      [node('svc-1', 'service'), node('q-1', 'queue'), node('db-1', 'database')],
      [edge('e1', 'svc-1', 'q-1', 'async'), edge('e2', 'q-1', 'db-1', 'async')],
    );
    expect(rule.check(contextFor(buffered, writeHeavyFacts))).toEqual([]);
    const sharded = graph(
      [node('svc-1', 'service'), node('db-1', 'database', { config: { sharding: 'hash' } })],
      [edge('e1', 'svc-1', 'db-1')],
    );
    expect(rule.check(contextFor(sharded, writeHeavyFacts))).toEqual([]);
  });

  it('stays silent when the workload writes little', () => {
    // The default 95:5 ratio puts writes at 400/s.
    expect(rule.check(contextFor(unbuffered))).toEqual([]);
  });
});

describe('scalability.worker-pool-underscaled', () => {
  const rule = ruleById('scalability.worker-pool-underscaled');
  const advanced = flashSaleFacts({ difficulty: 'advanced' });
  const lopsided = graph(
    [
      node('svc-1', 'service', { config: { replicas: 3 } }),
      node('q-1', 'queue'),
      node('worker-1', 'worker'),
    ],
    [edge('e1', 'svc-1', 'q-1', 'async'), edge('e2', 'q-1', 'worker-1', 'async')],
  );

  it('fires at advanced when a scaled producer drains into one worker', () => {
    const findings = rule.check(contextFor(lopsided, advanced));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['q-1', 'worker-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'worker-1', set: { config: { replicas: 3 } } },
    ]);
  });

  it('stays silent when the pool is scaled or the producer is not', () => {
    const pooled = graph(
      [
        node('svc-1', 'service', { config: { replicas: 3 } }),
        node('q-1', 'queue'),
        node('worker-1', 'worker', { config: { replicas: 3 } }),
      ],
      lopsided.edges,
    );
    expect(rule.check(contextFor(pooled, advanced))).toEqual([]);
    const calmProducer = graph(
      [node('svc-1', 'service'), node('q-1', 'queue'), node('worker-1', 'worker')],
      lopsided.edges,
    );
    expect(rule.check(contextFor(calmProducer, advanced))).toEqual([]);
  });

  it('stays silent below advanced — standard reference designs run single workers', () => {
    expect(rule.check(contextFor(lopsided))).toEqual([]);
  });
});

describe('scalability.no-sharding-hot-writes', () => {
  const rule = ruleById('scalability.no-sharding-hot-writes');
  const hotFacts = flashSaleFacts({
    difficulty: 'advanced',
    scaleTargets: {
      ...flashSaleFacts().scaleTargets,
      requestsPerSecond: 200000,
      readWriteRatio: '50:50',
    },
  });
  const unsharded = graph(
    [node('svc-1', 'service'), node('db-1', 'database')],
    [edge('e1', 'svc-1', 'db-1')],
  );

  it('fires at advanced when writes/s outgrow any single primary', () => {
    // 200,000 req/s at 50:50 is 100,000 writes/s.
    const findings = rule.check(contextFor(unsharded, hotFacts));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['db-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'db-1', set: { config: { sharding: 'hash' } } },
    ]);
  });

  it('stays silent when the store is sharded or the tier is not advanced', () => {
    const sharded = graph(
      [node('svc-1', 'service'), node('db-1', 'database', { config: { sharding: 'range' } })],
      unsharded.edges,
    );
    expect(rule.check(contextFor(sharded, hotFacts))).toEqual([]);
    expect(rule.check(contextFor(unsharded, { ...hotFacts, difficulty: 'standard' }))).toEqual([]);
  });
});

describe('scalability.hot-partition-risk', () => {
  const rule = ruleById('scalability.hot-partition-risk');
  const advanced = flashSaleFacts({ difficulty: 'advanced' });
  const unspread = graph(
    [node('svc-1', 'service'), node('db-1', 'database'), node('stream-1', 'event-stream')],
    [edge('e1', 'svc-1', 'db-1'), edge('e2', 'svc-1', 'stream-1', 'async')],
  );

  it('fires at advanced when nothing spreads the hot key', () => {
    const findings = rule.check(contextFor(unspread, advanced));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['db-1', 'stream-1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent once a store is sharded or a stream is partitioned', () => {
    const sharded = graph(
      [node('svc-1', 'service'), node('db-1', 'database', { config: { sharding: 'hash' } })],
      [edge('e1', 'svc-1', 'db-1')],
    );
    expect(rule.check(contextFor(sharded, advanced))).toEqual([]);
    const partitioned = graph(
      [node('svc-1', 'service'), node('stream-1', 'event-stream', { config: { partitions: 4 } })],
      [edge('e1', 'svc-1', 'stream-1', 'async')],
    );
    expect(rule.check(contextFor(partitioned, advanced))).toEqual([]);
  });

  it('fires for any archetype at advanced — hot keys are not archetype-specific', () => {
    expect(rule.check(contextFor(unspread, mediaFacts({ difficulty: 'advanced' })))).toHaveLength(
      1,
    );
  });

  it('stays silent below advanced difficulty', () => {
    expect(rule.check(contextFor(unspread))).toEqual([]);
  });
});

describe('scalability.no-autoscaling', () => {
  const rule = ruleById('scalability.no-autoscaling');
  const costCapped = flashSaleFacts({ nfrKinds: ['availability', 'cost'] });
  const fixedFleet = graph(
    [node('svc-1', 'service', { config: { replicas: 3 } }), node('db-1', 'database')],
    [edge('e1', 'svc-1', 'db-1')],
  );

  it('fires when spend is capped and nothing scales with demand', () => {
    const findings = rule.check(contextFor(fixedFleet, costCapped));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['svc-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'svc-1', set: { config: { replicas: 3, autoscaling: true } } },
    ]);
  });

  it('stays silent once a service autoscales or serverless compute exists', () => {
    const elastic = graph(
      [node('svc-1', 'service', { config: { autoscaling: true } }), node('db-1', 'database')],
      fixedFleet.edges,
    );
    expect(rule.check(contextFor(elastic, costCapped))).toEqual([]);
    const serverless = graph([...fixedFleet.nodes, node('fn-1', 'serverless-function')]);
    expect(rule.check(contextFor(serverless, costCapped))).toEqual([]);
  });

  it('stays silent when cost is not a stated requirement', () => {
    expect(rule.check(contextFor(fixedFleet))).toEqual([]);
  });
});

describe('scalability.overengineered-intro', () => {
  const rule = ruleById('scalability.overengineered-intro');
  const smallIntro = flashSaleFacts({
    difficulty: 'intro',
    scaleTargets: { ...flashSaleFacts().scaleTargets, requestsPerSecond: 300 },
  });

  it('fires at intro scale on layered caches, a mesh, or regional placement', () => {
    const doubleCached = graph([node('cache-1', 'cache'), node('cache-2', 'cache')]);
    const cacheFindings = rule.check(contextFor(doubleCached, smallIntro));
    expect(cacheFindings).toHaveLength(1);
    expect(cacheFindings[0].severity).toBe('low');
    expect(cacheFindings[0].affectedNodeIds).toEqual(['cache-1', 'cache-2']);
    expect(cacheFindings[0].suggestion).toBeNull();

    const meshed = graph([node('mesh-1', 'service-mesh'), node('svc-1', 'service')]);
    expect(rule.check(contextFor(meshed, smallIntro))[0]?.affectedNodeIds).toEqual(['mesh-1']);

    const regional = graph([node('svc-1', 'service', { config: { region: 'us-east-1' } })]);
    expect(rule.check(contextFor(regional, smallIntro))[0]?.affectedNodeIds).toEqual(['svc-1']);
  });

  it('forgives a single cache at intro scale', () => {
    const modest = graph([node('cache-1', 'cache'), node('svc-1', 'service')]);
    expect(rule.check(contextFor(modest, smallIntro))).toEqual([]);
  });

  it('stays silent above intro difficulty or at real traffic', () => {
    const doubleCached = graph([node('cache-1', 'cache'), node('cache-2', 'cache')]);
    expect(rule.check(contextFor(doubleCached))).toEqual([]);
    const busyIntro = flashSaleFacts({ difficulty: 'intro' });
    expect(rule.check(contextFor(doubleCached, busyIntro))).toEqual([]);
  });
});
