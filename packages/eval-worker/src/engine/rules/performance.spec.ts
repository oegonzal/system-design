import { describe, expect, it } from 'vitest';

import { contextFor, edge, flashSaleFacts, graph, node, ruleById } from '../testing';

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
