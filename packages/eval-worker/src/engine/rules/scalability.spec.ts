import { describe, expect, it } from 'vitest';

import { contextFor, edge, flashSaleFacts, graph, node, ruleById } from '../testing';

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
