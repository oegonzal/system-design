import { describe, expect, it } from 'vitest';

import {
  contextFor,
  dagFacts,
  edge,
  flashSaleFacts,
  graph,
  node,
  ruleById,
  workflowFacts,
} from '../testing';

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

  it('fires at high request rates on a gateway with no rate limit, suggesting the config flip', () => {
    const unlimited = graph([node('gw-1', 'gateway')]);
    const findings = rule.check(contextFor(unlimited));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['gw-1']);
    expect(findings[0].suggestion?.ops[0]).toMatchObject({
      op: 'update-node',
      nodeId: 'gw-1',
      set: { config: { rateLimit: true } },
    });
  });

  it('fires below the traffic bar when the prompt makes security a requirement', () => {
    const findings = rule.check(contextFor(graph([node('gw-1', 'gateway')]), workflowFacts()));
    expect(findings).toHaveLength(1);
  });

  it('stays silent when no edge tier exists to enforce the limit', () => {
    expect(rule.check(contextFor(graph([node('client-1', 'client')])))).toEqual([]);
  });

  it('stays silent when rate limiting is on, or when exposure is low', () => {
    const limited = graph([node('gw-1', 'gateway', { config: { rateLimit: true } })]);
    expect(rule.check(contextFor(limited))).toEqual([]);
    expect(rule.check(contextFor(graph([node('gw-1', 'gateway')]), dagFacts()))).toEqual([]);
  });
});

describe('security.edge-hits-data-layer', () => {
  const rule = ruleById('security.edge-hits-data-layer');

  it('fires when a CDN or DNS node reaches straight into a store', () => {
    const leaky = graph(
      [node('cdn-1', 'cdn'), node('db-1', 'database'), node('dns-1', 'dns'), node('q-1', 'queue')],
      [edge('e1', 'cdn-1', 'db-1'), edge('e2', 'dns-1', 'q-1')],
    );
    const findings = rule.check(contextFor(leaky));
    expect(findings).toHaveLength(2);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['cdn-1', 'db-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[1].affectedNodeIds).toEqual(['dns-1', 'q-1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('allows the CDN origin pull from an object store by design', () => {
    const originPull = graph(
      [node('cdn-1', 'cdn'), node('store-1', 'object-store')],
      [edge('e1', 'cdn-1', 'store-1')],
    );
    expect(rule.check(contextFor(originPull))).toEqual([]);
  });

  it('stays silent when the edge hands off to a gateway', () => {
    const routed = graph(
      [node('cdn-1', 'cdn'), node('gw-1', 'gateway')],
      [edge('e1', 'cdn-1', 'gw-1')],
    );
    expect(rule.check(contextFor(routed))).toEqual([]);
  });
});

describe('security.gateway-no-auth', () => {
  const rule = ruleById('security.gateway-no-auth');
  const advanced = flashSaleFacts({ difficulty: 'advanced' });
  const openDoor = graph(
    [node('gw-1', 'gateway'), node('svc-1', 'service')],
    [edge('e1', 'gw-1', 'svc-1')],
  );

  it('fires at advanced on a gateway that authenticates nobody', () => {
    const findings = rule.check(contextFor(openDoor, advanced));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['gw-1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'gw-1', set: { config: { authMode: 'jwt' } } },
    ]);
    const explicitNone = graph(
      [node('gw-1', 'gateway', { config: { authMode: 'none' } }), node('svc-1', 'service')],
      openDoor.edges,
    );
    expect(rule.check(contextFor(explicitNone, advanced))).toHaveLength(1);
  });

  it('stays silent when the gateway validates tokens or an auth service exists', () => {
    const jwt = graph(
      [node('gw-1', 'gateway', { config: { authMode: 'jwt' } }), node('svc-1', 'service')],
      openDoor.edges,
    );
    expect(rule.check(contextFor(jwt, advanced))).toEqual([]);
    const delegated = graph([...openDoor.nodes, node('auth-1', 'auth-service')], openDoor.edges);
    expect(rule.check(contextFor(delegated, advanced))).toEqual([]);
  });

  it('stays silent below advanced difficulty', () => {
    expect(rule.check(contextFor(openDoor))).toEqual([]);
  });
});

describe('security.client-writes-queue', () => {
  const rule = ruleById('security.client-writes-queue');

  it('fires on a synchronous client push into a queue', () => {
    const untrusted = graph(
      [node('client-1', 'client'), node('q-1', 'queue')],
      [edge('e1', 'client-1', 'q-1')],
    );
    const findings = rule.check(contextFor(untrusted));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['client-1', 'q-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('exempts the async waiting-room admission edge by design', () => {
    const waitingRoom = graph(
      [node('client-1', 'client'), node('q-1', 'queue')],
      [edge('e1', 'client-1', 'q-1', 'async')],
    );
    expect(rule.check(contextFor(waitingRoom))).toEqual([]);
  });

  it('stays silent when a service produces into the queue', () => {
    const fronted = graph(
      [node('svc-1', 'service'), node('q-1', 'queue')],
      [edge('e1', 'svc-1', 'q-1')],
    );
    expect(rule.check(contextFor(fronted))).toEqual([]);
  });
});

describe('security.payment-provider-unguarded', () => {
  const rule = ruleById('security.payment-provider-unguarded');

  it('fires when charges flow in without idempotency keys', () => {
    const doubleCharge = graph(
      [node('svc-1', 'service'), node('pay-1', 'payment-provider')],
      [edge('e1', 'svc-1', 'pay-1')],
    );
    const findings = rule.check(contextFor(doubleCharge));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['pay-1', 'svc-1']);
    expect(findings[0].affectedEdgeIds).toEqual(['e1']);
    expect(findings[0].suggestion?.ops).toEqual([
      { op: 'update-node', nodeId: 'pay-1', set: { config: { idempotencyKeys: true } } },
    ]);
  });

  it('stays silent when keys are on or nothing calls the provider', () => {
    const keyed = graph(
      [
        node('svc-1', 'service'),
        node('pay-1', 'payment-provider', { config: { idempotencyKeys: true } }),
      ],
      [edge('e1', 'svc-1', 'pay-1')],
    );
    expect(rule.check(contextFor(keyed))).toEqual([]);
    const uncalled = graph([node('pay-1', 'payment-provider')]);
    expect(rule.check(contextFor(uncalled))).toEqual([]);
  });
});
