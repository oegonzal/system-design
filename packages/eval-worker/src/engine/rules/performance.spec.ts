import { describe, expect, it } from 'vitest';

import { contextFor, edge, flashSaleFacts, graph, mediaFacts, node, ruleById } from '../testing';

describe('performance.no-cdn-static', () => {
  const rule = ruleById('performance.no-cdn-static');

  it('fires for a media-streaming archetype with no CDN', () => {
    const bare = graph([node('client-1', 'client')]);
    const findings = rule.check(
      contextFor(bare, flashSaleFacts({ archetype: 'media-streaming-pipeline' })),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('fires when an object store exists with no CDN in front', () => {
    const stored = graph([node('store-1', 'object-store')]);
    const findings = rule.check(contextFor(stored));
    expect(findings).toHaveLength(1);
    expect(findings[0].affectedNodeIds).toEqual(['store-1']);
  });

  it('stays silent once a CDN is present', () => {
    const fronted = graph([node('cdn-1', 'cdn'), node('store-1', 'object-store')]);
    expect(
      rule.check(contextFor(fronted, flashSaleFacts({ archetype: 'media-streaming-pipeline' }))),
    ).toEqual([]);
  });

  it('stays silent for other archetypes without static storage', () => {
    expect(rule.check(contextFor(graph([node('client-1', 'client')])))).toEqual([]);
  });
});

describe('performance.chatty-client', () => {
  const rule = ruleById('performance.chatty-client');

  function chatty(serviceCount: number, withGateway = false) {
    const services = Array.from({ length: serviceCount }, (_, i) =>
      node(`svc-${i + 1}`, 'service'),
    );
    const edges = services.map((svc, i) => edge(`e${i + 1}`, 'client-1', svc.id));
    const nodes = [node('client-1', 'client'), ...services];
    if (withGateway) nodes.push(node('gw-1', 'gateway'));
    return graph(nodes, edges);
  }

  it('fires when a client calls three services and no gateway exists', () => {
    const findings = rule.check(contextFor(chatty(3)));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].affectedNodeIds).toEqual(['client-1', 'svc-1', 'svc-2', 'svc-3']);
  });

  it('stays silent when a gateway is present', () => {
    expect(rule.check(contextFor(chatty(3, true)))).toEqual([]);
  });

  it('stays silent at two services', () => {
    expect(rule.check(contextFor(chatty(2)))).toEqual([]);
  });
});

describe('performance.deep-sync-chain', () => {
  const rule = ruleById('performance.deep-sync-chain');

  function chainOf(hops: number) {
    const nodes = [node('client-1', 'client')];
    const edges = [];
    let previous = 'client-1';
    for (let i = 1; i <= hops; i += 1) {
      const id = i === hops ? 'db-1' : `svc-${i}`;
      nodes.push(node(id, i === hops ? 'database' : 'service'));
      edges.push(edge(`e${i}`, previous, id));
      previous = id;
    }
    return graph(nodes, edges);
  }

  it('fires when the sync path outruns a tight latency budget', () => {
    // flash-sale facts: p99 250ms ≤ 300 gate; six hops > five.
    const findings = rule.check(contextFor(chainOf(6)));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].message).toContain('6 hops');
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent at five hops — the reference read path', () => {
    expect(rule.check(contextFor(chainOf(5)))).toEqual([]);
  });

  it('stays silent when the latency budget is loose', () => {
    const relaxed = flashSaleFacts({
      scaleTargets: { ...flashSaleFacts().scaleTargets, p99LatencyMs: 400 },
    });
    expect(rule.check(contextFor(chainOf(6), relaxed))).toEqual([]);
  });

  it('does not count async segments toward the chain', () => {
    const buffered = graph(
      [
        node('client-1', 'client'),
        node('svc-1', 'service'),
        node('q-1', 'queue'),
        node('svc-2', 'service'),
        node('svc-3', 'service'),
        node('svc-4', 'service'),
        node('db-1', 'database'),
      ],
      [
        edge('e1', 'client-1', 'svc-1'),
        edge('e2', 'svc-1', 'q-1', 'async'),
        edge('e3', 'q-1', 'svc-2', 'async'),
        edge('e4', 'svc-2', 'svc-3'),
        edge('e5', 'svc-3', 'svc-4'),
        edge('e6', 'svc-4', 'db-1'),
      ],
    );
    expect(rule.check(contextFor(buffered))).toEqual([]);
  });
});

describe('performance.origin-serves-media', () => {
  const rule = ruleById('performance.origin-serves-media');
  const originPull = graph(
    [node('client-1', 'client'), node('svc-1', 'service'), node('store-1', 'object-store')],
    [edge('e1', 'client-1', 'svc-1'), edge('e2', 'svc-1', 'store-1')],
  );

  it('fires when a client can reach the object store around the CDN', () => {
    const findings = rule.check(contextFor(originPull, mediaFacts()));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['client-1', 'store-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'add-node', node: { id: 'suggested-cdn-1', kind: 'cdn', label: 'CDN' } },
      {
        op: 'add-edge',
        edge: {
          id: 'suggested-edge-cdn-1',
          source: 'client-1',
          target: 'suggested-cdn-1',
          kind: 'sync',
        },
      },
    ]);
  });

  it('stays silent when every client path to the store rides the CDN', () => {
    const edged = graph(
      [
        node('client-1', 'client'),
        node('cdn-1', 'cdn'),
        node('store-1', 'object-store'),
        node('svc-1', 'service'),
      ],
      [
        edge('e1', 'client-1', 'cdn-1'),
        edge('e2', 'cdn-1', 'store-1'),
        edge('e3', 'cdn-1', 'svc-1'),
      ],
    );
    expect(rule.check(contextFor(edged, mediaFacts()))).toEqual([]);
  });

  it('fires for any archetype — an uncached client path to an object store is generic', () => {
    expect(rule.check(contextFor(originPull))).toHaveLength(1);
  });
});

describe('performance.replica-unused-for-reads', () => {
  const rule = ruleById('performance.replica-unused-for-reads');
  const idleReplica = graph(
    [
      node('client-1', 'client'),
      node('svc-1', 'service'),
      node('db-1', 'database'),
      node('rep-1', 'replica'),
    ],
    [
      edge('e1', 'client-1', 'svc-1'),
      edge('e2', 'svc-1', 'db-1'),
      edge('e3', 'db-1', 'rep-1', 'async'),
    ],
  );

  it('fires when reads pound the primary past an idle replica', () => {
    const findings = rule.check(contextFor(idleReplica));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['rep-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      {
        op: 'add-edge',
        edge: {
          id: 'suggested-edge-read-replica-1',
          source: 'svc-1',
          target: 'rep-1',
          kind: 'sync',
        },
      },
    ]);
  });

  it('stays silent when a service already reads from the replica', () => {
    const split = graph(idleReplica.nodes, [...idleReplica.edges, edge('e4', 'svc-1', 'rep-1')]);
    expect(rule.check(contextFor(split))).toEqual([]);
  });

  it('stays silent when a cache shields the primary instead', () => {
    const cached = graph(
      [...idleReplica.nodes, node('cache-1', 'cache')],
      [
        edge('e1', 'client-1', 'svc-1'),
        edge('e2', 'svc-1', 'cache-1'),
        edge('e3', 'cache-1', 'db-1'),
        edge('e4', 'db-1', 'rep-1', 'async'),
      ],
    );
    expect(rule.check(contextFor(cached))).toEqual([]);
  });

  it('stays silent when no replica exists', () => {
    const plain = graph(
      [node('svc-1', 'service'), node('db-1', 'database')],
      [edge('e1', 'svc-1', 'db-1')],
    );
    expect(rule.check(contextFor(plain))).toEqual([]);
  });
});

describe('performance.data-lake-serves-users', () => {
  const rule = ruleById('performance.data-lake-serves-users');

  it('fires when a client path reaches the lake', () => {
    const crawled = graph(
      [node('client-1', 'client'), node('svc-1', 'service'), node('lake-1', 'data-lake')],
      [edge('e1', 'client-1', 'svc-1'), edge('e2', 'svc-1', 'lake-1')],
    );
    const findings = rule.check(contextFor(crawled));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['client-1', 'lake-1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent when the lake only feeds pipelines', () => {
    const pipelined = graph(
      [
        node('client-1', 'client'),
        node('svc-1', 'service'),
        node('db-1', 'database'),
        node('lake-1', 'data-lake'),
        node('worker-1', 'worker'),
      ],
      [
        edge('e1', 'client-1', 'svc-1'),
        edge('e2', 'svc-1', 'db-1'),
        edge('e3', 'worker-1', 'lake-1', 'async'),
      ],
    );
    expect(rule.check(contextFor(pipelined))).toEqual([]);
  });
});

describe('performance.ml-inference-unguarded', () => {
  const rule = ruleById('performance.ml-inference-unguarded');

  it('fires on sync inference with neither timeout nor fallback', () => {
    const tail = graph(
      [node('svc-1', 'service'), node('ml-1', 'ml-inference')],
      [edge('e1', 'svc-1', 'ml-1')],
    );
    const findings = rule.check(contextFor(tail));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['ml-1', 'svc-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'ml-1', set: { config: { timeoutMs: 500, fallback: true } } },
    ]);
  });

  it('stays silent once a timeout or a fallback guards the call', () => {
    const bounded = graph(
      [node('svc-1', 'service'), node('ml-1', 'ml-inference', { config: { timeoutMs: 250 } })],
      [edge('e1', 'svc-1', 'ml-1')],
    );
    expect(rule.check(contextFor(bounded))).toEqual([]);
    const degradable = graph(
      [node('svc-1', 'service'), node('ml-1', 'ml-inference', { config: { fallback: true } })],
      [edge('e1', 'svc-1', 'ml-1')],
    );
    expect(rule.check(contextFor(degradable))).toEqual([]);
  });

  it('stays silent when inference is called asynchronously', () => {
    const buffered = graph(
      [node('worker-1', 'worker'), node('ml-1', 'ml-inference')],
      [edge('e1', 'worker-1', 'ml-1', 'async')],
    );
    expect(rule.check(contextFor(buffered))).toEqual([]);
  });
});

describe('performance.serverless-cold-hot-path', () => {
  const rule = ruleById('performance.serverless-cold-hot-path');
  const hotPath = graph(
    [node('client-1', 'client'), node('gw-1', 'gateway'), node('fn-1', 'serverless-function')],
    [edge('e1', 'client-1', 'gw-1'), edge('e2', 'gw-1', 'fn-1')],
  );

  it('fires on an unwarmed function serving a tight sync path', () => {
    const findings = rule.check(contextFor(hotPath));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].affectedNodeIds).toEqual(['fn-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'fn-1', set: { config: { provisionedConcurrency: 10 } } },
    ]);
  });

  it('stays silent when the function is provisioned or off the sync path', () => {
    const warmed = graph(
      [
        node('client-1', 'client'),
        node('gw-1', 'gateway'),
        node('fn-1', 'serverless-function', { config: { provisionedConcurrency: 5 } }),
      ],
      hotPath.edges,
    );
    expect(rule.check(contextFor(warmed))).toEqual([]);
    const offPath = graph(
      [node('client-1', 'client'), node('gw-1', 'gateway'), node('fn-1', 'serverless-function')],
      [edge('e1', 'client-1', 'gw-1'), edge('e2', 'gw-1', 'fn-1', 'async')],
    );
    expect(rule.check(contextFor(offPath))).toEqual([]);
  });

  it('stays silent on a relaxed latency budget', () => {
    const relaxed = flashSaleFacts({
      scaleTargets: { ...flashSaleFacts().scaleTargets, p99LatencyMs: 800 },
    });
    expect(rule.check(contextFor(hotPath, relaxed))).toEqual([]);
  });
});
