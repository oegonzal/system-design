import { describe, expect, it } from 'vitest';

import { contextFor, edge, flashSaleFacts, graph, node, ruleById } from '../testing';

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
