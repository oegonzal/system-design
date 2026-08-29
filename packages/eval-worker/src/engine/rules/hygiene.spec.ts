import { describe, expect, it } from 'vitest';

import { contextFor, edge, graph, node, ruleById } from '../testing';

describe('hygiene.orphan-node', () => {
  const rule = ruleById('hygiene.orphan-node');

  it('fires once, listing every disconnected node', () => {
    const withOrphans = graph(
      [
        node('client-1', 'client'),
        node('svc-1', 'service'),
        node('cache-9', 'cache'),
        node('sched-1', 'scheduler'),
      ],
      [edge('e1', 'client-1', 'svc-1')],
    );
    const findings = rule.check(contextFor(withOrphans));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].affectedNodeIds).toEqual(['cache-9', 'sched-1']);
  });

  it('stays silent when every node participates', () => {
    const connected = graph(
      [node('client-1', 'client'), node('svc-1', 'service')],
      [edge('e1', 'client-1', 'svc-1')],
    );
    expect(rule.check(contextFor(connected))).toEqual([]);
  });
});

describe('hygiene.client-to-db', () => {
  const rule = ruleById('hygiene.client-to-db');

  it('fires on a direct client→database edge', () => {
    const exposed = graph(
      [node('client-1', 'client'), node('db-1', 'database')],
      [edge('e1', 'client-1', 'db-1')],
    );
    const findings = rule.check(contextFor(exposed));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('fires on a direct client→cache edge too', () => {
    const cached = graph(
      [node('client-1', 'client'), node('cache-1', 'cache')],
      [edge('e1', 'client-1', 'cache-1')],
    );
    expect(rule.check(contextFor(cached))).toHaveLength(1);
  });

  it('stays silent when the client talks to a service', () => {
    const fine = graph(
      [node('client-1', 'client'), node('svc-1', 'service')],
      [edge('e1', 'client-1', 'svc-1')],
    );
    expect(rule.check(contextFor(fine))).toEqual([]);
  });
});

describe('hygiene.sync-cycle', () => {
  const rule = ruleById('hygiene.sync-cycle');

  it('fires when synchronous calls loop back onto themselves', () => {
    const loop = graph(
      [node('svc-1', 'service'), node('svc-2', 'service'), node('svc-3', 'service')],
      [edge('e1', 'svc-1', 'svc-2'), edge('e2', 'svc-2', 'svc-3'), edge('e3', 'svc-3', 'svc-1')],
    );
    const findings = rule.check(contextFor(loop));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual([]);
    expect(findings[0].suggestion).toBeNull();
  });

  it('ignores cycles closed only by async edges', () => {
    const asyncLoop = graph(
      [node('svc-1', 'service'), node('svc-2', 'service')],
      [edge('e1', 'svc-1', 'svc-2'), edge('e2', 'svc-2', 'svc-1', 'async')],
    );
    expect(rule.check(contextFor(asyncLoop))).toEqual([]);
  });

  it('stays silent on an acyclic call graph', () => {
    const chain = graph(
      [node('svc-1', 'service'), node('svc-2', 'service')],
      [edge('e1', 'svc-1', 'svc-2')],
    );
    expect(rule.check(contextFor(chain))).toEqual([]);
  });
});

describe('hygiene.disconnected-clusters', () => {
  const rule = ruleById('hygiene.disconnected-clusters');

  it('fires on two islands and points at the smaller one', () => {
    const split = graph(
      [
        node('client-1', 'client'),
        node('svc-1', 'service'),
        node('db-1', 'database'),
        node('q-9', 'queue'),
        node('worker-9', 'worker'),
      ],
      [
        edge('e1', 'client-1', 'svc-1'),
        edge('e2', 'svc-1', 'db-1'),
        edge('e3', 'q-9', 'worker-9', 'async'),
      ],
    );
    const findings = rule.check(contextFor(split));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].affectedNodeIds).toEqual(['q-9', 'worker-9']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('leaves lone orphan nodes to the orphan rule', () => {
    const withOrphan = graph(
      [node('svc-1', 'service'), node('db-1', 'database'), node('cache-9', 'cache')],
      [edge('e1', 'svc-1', 'db-1')],
    );
    expect(rule.check(contextFor(withOrphan))).toEqual([]);
  });

  it('stays silent on a connected design', () => {
    const connected = graph(
      [node('svc-1', 'service'), node('db-1', 'database')],
      [edge('e1', 'svc-1', 'db-1')],
    );
    expect(rule.check(contextFor(connected))).toEqual([]);
  });
});

describe('hygiene.duplicate-edges', () => {
  const rule = ruleById('hygiene.duplicate-edges');

  it('fires on repeated edges and removes the later duplicates', () => {
    const doubled = graph(
      [node('svc-1', 'service'), node('db-1', 'database')],
      [edge('e1', 'svc-1', 'db-1'), edge('e2', 'svc-1', 'db-1'), edge('e3', 'svc-1', 'db-1')],
    );
    const findings = rule.check(contextFor(doubled));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].affectedEdgeIds).toEqual(['e2', 'e3']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'remove-edge', edgeId: 'e2' },
      { op: 'remove-edge', edgeId: 'e3' },
    ]);
  });

  it('treats sync and async edges between the same nodes as distinct', () => {
    const mixed = graph(
      [node('svc-1', 'service'), node('db-1', 'database')],
      [edge('e1', 'svc-1', 'db-1'), edge('e2', 'svc-1', 'db-1', 'async')],
    );
    expect(rule.check(contextFor(mixed))).toEqual([]);
  });

  it('stays silent when every edge is unique', () => {
    const clean = graph(
      [node('svc-1', 'service'), node('db-1', 'database'), node('cache-1', 'cache')],
      [edge('e1', 'svc-1', 'db-1'), edge('e2', 'svc-1', 'cache-1')],
    );
    expect(rule.check(contextFor(clean))).toEqual([]);
  });
});

describe('hygiene.mesh-overkill', () => {
  const rule = ruleById('hygiene.mesh-overkill');

  it('fires on a mesh guarding fewer than three services', () => {
    const overdressed = graph(
      [node('mesh-1', 'service-mesh'), node('svc-1', 'service'), node('svc-2', 'service')],
      [edge('e1', 'svc-1', 'svc-2')],
    );
    const findings = rule.check(contextFor(overdressed));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].affectedNodeIds).toEqual(['mesh-1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('stays silent with three services or no mesh', () => {
    const earned = graph(
      [
        node('mesh-1', 'service-mesh'),
        node('svc-1', 'service'),
        node('svc-2', 'service'),
        node('svc-3', 'service'),
      ],
      [edge('e1', 'svc-1', 'svc-2')],
    );
    expect(rule.check(contextFor(earned))).toEqual([]);
    const meshless = graph([node('svc-1', 'service'), node('svc-2', 'service')]);
    expect(rule.check(contextFor(meshless))).toEqual([]);
  });
});
