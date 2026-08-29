import { describe, expect, it } from 'vitest';

import {
  analyticsFacts,
  contextFor,
  edge,
  flashSaleFacts,
  graph,
  mediaFacts,
  node,
  ruleById,
  workflowFacts,
} from '../testing';

describe('data.mixed-oltp-analytics', () => {
  const rule = ruleById('data.mixed-oltp-analytics');
  const oneStore = graph(
    [node('client-1', 'client'), node('svc-1', 'service'), node('db-1', 'database')],
    [edge('e1', 'client-1', 'svc-1'), edge('e2', 'svc-1', 'db-1')],
  );

  it('fires when dashboards and OLTP share the only database', () => {
    const findings = rule.check(contextFor(oneStore, analyticsFacts()));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['db-1']);
  });

  it('stays silent once a replica splits the read path', () => {
    const split = graph(
      [node('db-1', 'database'), node('rep-1', 'replica')],
      [edge('e1', 'db-1', 'rep-1', 'async')],
    );
    expect(rule.check(contextFor(split, analyticsFacts()))).toEqual([]);
  });

  it('fires for any archetype whose requirements ask for analytical reads', () => {
    const reporting = workflowFacts({
      functionalText: 'define automation workflows; view a run analytics dashboard',
    });
    expect(rule.check(contextFor(oneStore, reporting))).toHaveLength(1);
  });

  it('stays silent when the requirements ask for nothing analytical', () => {
    expect(rule.check(contextFor(oneStore))).toEqual([]);
  });
});

describe('data.no-search-index', () => {
  const rule = ruleById('data.no-search-index');
  const searchFacts = analyticsFacts({
    functionalText: 'search past campaigns; render live dashboards',
  });

  it('fires when the requirements mention search and no index exists', () => {
    const findings = rule.check(contextFor(graph([node('db-1', 'database')]), searchFacts));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('stays silent when a search index is present', () => {
    expect(rule.check(contextFor(graph([node('idx-1', 'search-index')]), searchFacts))).toEqual([]);
  });

  it('stays silent when search is not required', () => {
    expect(rule.check(contextFor(graph([node('db-1', 'database')]), analyticsFacts()))).toEqual([]);
  });
});

describe('data.cache-as-source-of-truth', () => {
  const rule = ruleById('data.cache-as-source-of-truth');

  it('fires when writes land in a cache with no database behind it', () => {
    const volatile = graph(
      [node('svc-1', 'service'), node('cache-1', 'cache')],
      [edge('e1', 'svc-1', 'cache-1')],
    );
    const findings = rule.check(contextFor(volatile));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['cache-1', 'svc-1']);
  });

  it('stays silent when a database is reachable downstream of the cache', () => {
    const durable = graph(
      [node('svc-1', 'service'), node('cache-1', 'cache'), node('db-1', 'database')],
      [edge('e1', 'svc-1', 'cache-1'), edge('e2', 'cache-1', 'db-1')],
    );
    expect(rule.check(contextFor(durable))).toEqual([]);
  });

  it('stays silent when nothing write-shaped feeds the cache', () => {
    const readOnly = graph(
      [node('db-1', 'database'), node('cache-1', 'cache')],
      [edge('e1', 'db-1', 'cache-1')],
    );
    expect(rule.check(contextFor(readOnly))).toEqual([]);
  });
});

describe('data.dual-write-no-outbox', () => {
  const rule = ruleById('data.dual-write-no-outbox');
  const dualWriter = graph(
    [node('svc-1', 'service'), node('db-1', 'database'), node('idx-1', 'search-index')],
    [edge('e1', 'svc-1', 'db-1'), edge('e2', 'svc-1', 'idx-1')],
  );

  it('fires on a service writing two stores with nothing to derive from', () => {
    const findings = rule.check(contextFor(dualWriter));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['db-1', 'idx-1', 'svc-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      {
        op: 'add-node',
        node: { id: 'suggested-cdc-connector-1', kind: 'cdc-connector', label: 'CDC connector' },
      },
      {
        op: 'add-edge',
        edge: {
          id: 'suggested-edge-cdc-source-1',
          source: 'db-1',
          target: 'suggested-cdc-connector-1',
          kind: 'async',
        },
      },
      {
        op: 'add-edge',
        edge: {
          id: 'suggested-edge-cdc-sink-1',
          source: 'suggested-cdc-connector-1',
          target: 'idx-1',
          kind: 'async',
        },
      },
    ]);
  });

  it('stays silent once any queue, stream, or CDC connector exists', () => {
    const withQueue = graph([...dualWriter.nodes, node('q-1', 'queue')], dualWriter.edges);
    expect(rule.check(contextFor(withQueue))).toEqual([]);
    const withCdc = graph([...dualWriter.nodes, node('cdc-1', 'cdc-connector')], dualWriter.edges);
    expect(rule.check(contextFor(withCdc))).toEqual([]);
  });

  it('does not treat cache-aside as a dual write', () => {
    const cacheAside = graph(
      [node('svc-1', 'service'), node('db-1', 'database'), node('cache-1', 'cache')],
      [edge('e1', 'svc-1', 'db-1'), edge('e2', 'svc-1', 'cache-1')],
    );
    expect(rule.check(contextFor(cacheAside))).toEqual([]);
  });
});

describe('data.no-idempotent-consumers', () => {
  const rule = ruleById('data.no-idempotent-consumers');
  const consistencyFacts = flashSaleFacts({
    nfrKinds: [...flashSaleFacts().nfrKinds, 'consistency'],
  });
  const replayable = graph(
    [node('q-1', 'queue'), node('worker-1', 'worker')],
    [edge('e1', 'q-1', 'worker-1', 'async')],
  );

  it('fires on a non-idempotent queue consumer when consistency is demanded', () => {
    const findings = rule.check(contextFor(replayable, consistencyFacts));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['q-1', 'worker-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'worker-1', set: { config: { idempotent: true } } },
    ]);
  });

  it('stays silent for idempotent consumers and workers not fed by a queue', () => {
    const keyed = graph(
      [node('q-1', 'queue'), node('worker-1', 'worker', { config: { idempotent: true } })],
      replayable.edges,
    );
    expect(rule.check(contextFor(keyed, consistencyFacts))).toEqual([]);
    const direct = graph(
      [node('svc-1', 'service'), node('worker-1', 'worker')],
      [edge('e1', 'svc-1', 'worker-1', 'async')],
    );
    expect(rule.check(contextFor(direct, consistencyFacts))).toEqual([]);
  });

  it('stays silent when the prompt never demands consistency', () => {
    expect(rule.check(contextFor(replayable))).toEqual([]);
  });
});

describe('data.cache-no-invalidation', () => {
  const rule = ruleById('data.cache-no-invalidation');
  const writerCached = graph(
    [node('svc-1', 'service'), node('db-1', 'database'), node('cache-1', 'cache')],
    [edge('e1', 'svc-1', 'db-1'), edge('e2', 'svc-1', 'cache-1')],
  );

  it('fires when the writer populates a cache with no invalidation', () => {
    const findings = rule.check(contextFor(writerCached));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['cache-1', 'svc-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e2']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'cache-1', set: { config: { invalidation: true } } },
    ]);
  });

  it('stays silent for invalidating and write-through caches', () => {
    const invalidating = graph(
      [
        node('svc-1', 'service'),
        node('db-1', 'database'),
        node('cache-1', 'cache', { config: { invalidation: true } }),
      ],
      writerCached.edges,
    );
    expect(rule.check(contextFor(invalidating))).toEqual([]);
    const writeThrough = graph(
      [
        node('svc-1', 'service'),
        node('db-1', 'database'),
        node('cache-1', 'cache', { config: { strategy: 'write-through' } }),
      ],
      writerCached.edges,
    );
    expect(rule.check(contextFor(writeThrough))).toEqual([]);
  });

  it('stays silent for the read-through chain and at intro', () => {
    const readThrough = graph(
      [node('svc-1', 'service'), node('cache-1', 'cache'), node('db-1', 'database')],
      [edge('e1', 'svc-1', 'cache-1'), edge('e2', 'cache-1', 'db-1')],
    );
    expect(rule.check(contextFor(readThrough))).toEqual([]);
    expect(rule.check(contextFor(writerCached, flashSaleFacts({ difficulty: 'intro' })))).toEqual(
      [],
    );
  });
});

describe('data.multi-writer-inventory', () => {
  const rule = ruleById('data.multi-writer-inventory');
  const consistencyFacts = flashSaleFacts({
    nfrKinds: [...flashSaleFacts().nfrKinds, 'consistency'],
  });
  const contended = graph(
    [node('svc-1', 'service'), node('svc-2', 'service'), node('db-1', 'database')],
    [edge('e1', 'svc-1', 'db-1'), edge('e2', 'svc-2', 'db-1')],
  );

  it('fires when two services race on one store under a consistency demand', () => {
    const findings = rule.check(contextFor(contended, consistencyFacts));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['db-1', 'svc-1', 'svc-2']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent with one synchronous writer', () => {
    const single = graph(contended.nodes, [
      edge('e1', 'svc-1', 'db-1'),
      edge('e2', 'svc-2', 'db-1', 'async'),
    ]);
    expect(rule.check(contextFor(single, consistencyFacts))).toEqual([]);
  });

  it('stays silent when the prompt never demands consistency', () => {
    expect(rule.check(contextFor(contended))).toEqual([]);
  });
});

describe('data.queue-not-durable', () => {
  const rule = ruleById('data.queue-not-durable');
  const lossy = graph(
    [
      node('q-1', 'queue', { config: { delivery: 'at-most-once' } }),
      node('worker-1', 'worker'),
      node('db-1', 'database'),
    ],
    [edge('e1', 'q-1', 'worker-1', 'async'), edge('e2', 'worker-1', 'db-1')],
  );

  it('fires on explicit at-most-once delivery feeding the durable store', () => {
    const findings = rule.check(contextFor(lossy, analyticsFacts()));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['q-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      {
        op: 'update-node',
        nodeId: 'q-1',
        set: { config: { delivery: 'at-least-once' } },
      },
    ]);
  });

  it('never accuses an unset delivery mode', () => {
    const unset = graph(
      [node('q-1', 'queue'), node('worker-1', 'worker'), node('db-1', 'database')],
      lossy.edges,
    );
    expect(rule.check(contextFor(unset, analyticsFacts()))).toEqual([]);
  });

  it('stays silent off the durable path and without a durability demand', () => {
    const detached = graph(
      [
        node('q-1', 'queue', { config: { delivery: 'at-most-once' } }),
        node('worker-1', 'worker'),
        node('db-1', 'database'),
      ],
      [edge('e1', 'q-1', 'worker-1', 'async')],
    );
    expect(rule.check(contextFor(detached, analyticsFacts()))).toEqual([]);
    expect(rule.check(contextFor(lossy))).toEqual([]);
  });
});

describe('data.no-backup-strategy', () => {
  const rule = ruleById('data.no-backup-strategy');
  const unprotected = graph(
    [node('svc-1', 'service'), node('db-1', 'database')],
    [edge('e1', 'svc-1', 'db-1')],
  );

  it('fires on a bare system of record under a durability demand', () => {
    const findings = rule.check(contextFor(unprotected, analyticsFacts()));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['db-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'db-1', set: { config: { backups: true } } },
    ]);
  });

  it('accepts backups, a replica neighbor, or a multi-region store as the story', () => {
    const backedUp = graph(
      [node('svc-1', 'service'), node('db-1', 'database', { config: { backups: true } })],
      unprotected.edges,
    );
    expect(rule.check(contextFor(backedUp, analyticsFacts()))).toEqual([]);
    const replicated = graph(
      [...unprotected.nodes, node('rep-1', 'replica')],
      [...unprotected.edges, edge('e2', 'db-1', 'rep-1', 'async')],
    );
    expect(rule.check(contextFor(replicated, analyticsFacts()))).toEqual([]);
    const spread = graph(
      [node('svc-1', 'service'), node('db-1', 'database', { config: { multiRegion: true } })],
      unprotected.edges,
    );
    expect(rule.check(contextFor(spread, analyticsFacts()))).toEqual([]);
  });

  it('stays silent at intro and without a durability demand', () => {
    expect(rule.check(contextFor(unprotected, analyticsFacts({ difficulty: 'intro' })))).toEqual(
      [],
    );
    expect(rule.check(contextFor(unprotected))).toEqual([]);
  });
});

describe('data.stream-no-retention', () => {
  const rule = ruleById('data.stream-no-retention');
  const advancedAnalytics = analyticsFacts({ difficulty: 'advanced' });
  const defaulted = graph(
    [node('svc-1', 'service'), node('stream-1', 'event-stream')],
    [edge('e1', 'svc-1', 'stream-1', 'async')],
  );

  it('fires at advanced analytics on a stream with no stated retention', () => {
    const findings = rule.check(contextFor(defaulted, advancedAnalytics));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].affectedNodeIds).toEqual(['stream-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'stream-1', set: { config: { retentionHours: 168 } } },
    ]);
  });

  it('stays silent once retention is stated', () => {
    const pinned = graph(
      [
        node('svc-1', 'service'),
        node('stream-1', 'event-stream', { config: { retentionHours: 48 } }),
      ],
      defaulted.edges,
    );
    expect(rule.check(contextFor(pinned, advancedAnalytics))).toEqual([]);
  });

  it('fires for any archetype whose prompt demands durability', () => {
    expect(rule.check(contextFor(defaulted, mediaFacts({ difficulty: 'advanced' })))).toHaveLength(
      1,
    );
  });

  it('stays silent below advanced and without a durability requirement', () => {
    expect(rule.check(contextFor(defaulted, analyticsFacts()))).toEqual([]);
    expect(rule.check(contextFor(defaulted, flashSaleFacts({ difficulty: 'advanced' })))).toEqual(
      [],
    );
  });
});
