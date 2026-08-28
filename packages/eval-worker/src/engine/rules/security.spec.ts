import { describe, expect, it } from 'vitest';

import { analyticsFacts, contextFor, edge, graph, node, ruleById } from '../testing';

describe('security.no-gateway', () => {
  const rule = ruleById('security.no-gateway');

  it('fires when client edges land directly on internal components', () => {
    const exposed = graph(
      [node('client-1', 'client'), node('svc-1', 'service'), node('db-1', 'database')],
      [edge('e1', 'client-1', 'svc-1'), edge('e2', 'client-1', 'db-1')],
    );
    const findings = rule.check(contextFor(exposed));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedEdgeIds).toEqual(['e1', 'e2']);
    expect(findings[0].affectedNodeIds).toEqual(['client-1', 'db-1', 'svc-1']);
  });

  it('stays silent when clients enter through a gateway or load balancer', () => {
    const gated = graph(
      [node('client-1', 'client'), node('gw-1', 'gateway'), node('svc-1', 'service')],
      [edge('e1', 'client-1', 'gw-1'), edge('e2', 'gw-1', 'svc-1')],
    );
    expect(rule.check(contextFor(gated))).toEqual([]);
    const balanced = graph(
      [node('client-1', 'client'), node('lb-1', 'load-balancer'), node('svc-1', 'service')],
      [edge('e1', 'client-1', 'lb-1'), edge('e2', 'lb-1', 'svc-1')],
    );
    expect(rule.check(contextFor(balanced))).toEqual([]);
  });
});

describe('security.no-rate-limit', () => {
  const rule = ruleById('security.no-rate-limit');

  it('fires for a flash sale whose gateway has no rate limit, suggesting the config flip', () => {
    const unlimited = graph([node('gw-1', 'gateway')]);
    const findings = rule.check(contextFor(unlimited));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].affectedNodeIds).toEqual(['gw-1']);
    expect(findings[0].suggestion?.ops[0]).toMatchObject({
      op: 'update-node',
      nodeId: 'gw-1',
      set: { config: { rateLimit: true } },
    });
  });

  it('fires with no suggestion when there is no edge node to configure', () => {
    const findings = rule.check(contextFor(graph([node('client-1', 'client')])));
    expect(findings).toHaveLength(1);
    expect(findings[0].suggestion).toBeNull();
    expect(findings[0].affectedNodeIds).toEqual([]);
  });

  it('stays silent when rate limiting is on, or for other archetypes', () => {
    const limited = graph([node('gw-1', 'gateway', { config: { rateLimit: true } })]);
    expect(rule.check(contextFor(limited))).toEqual([]);
    expect(rule.check(contextFor(graph([node('gw-1', 'gateway')]), analyticsFacts()))).toEqual([]);
  });
});
