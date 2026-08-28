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
