import { describe, expect, it } from 'vitest';

import type { CanvasGraph } from './canvas';
import { unmentionedNodeLabels } from './narrative';

const graphWith = (...labels: string[]): CanvasGraph => ({
  nodes: labels.map((label, i) => ({ id: `n-${i}`, kind: 'service', label })),
  edges: [],
});

describe('unmentionedNodeLabels', () => {
  it('returns [] when every label is mentioned', () => {
    const graph = graphWith('API Gateway', 'Order Service', 'Primary DB');

    const narrative =
      'Traffic enters through the API Gateway, the Order Service owns the ' +
      'order lifecycle, and state lives in the Primary DB.';

    expect(unmentionedNodeLabels(graph, narrative)).toEqual([]);
  });

  it('matches case-insensitively in both directions', () => {
    const graph = graphWith('API Gateway', 'ORDER SERVICE');

    expect(unmentionedNodeLabels(graph, 'the api gateway calls the Order Service')).toEqual([]);
  });

  it('lists a missing label once even when duplicate labels appear', () => {
    const graph = graphWith('Cache', 'cache', 'Primary DB');

    expect(unmentionedNodeLabels(graph, 'reads hit the Primary DB')).toEqual(['Cache']);
  });

  it('returns every label, in first-appearance order, for an empty narrative', () => {
    const graph = graphWith('Web client', 'API Gateway', 'Primary DB');

    expect(unmentionedNodeLabels(graph, '')).toEqual(['Web client', 'API Gateway', 'Primary DB']);
  });

  it('skips empty and whitespace-only labels', () => {
    const graph = graphWith('', '   ', 'Queue');

    expect(unmentionedNodeLabels(graph, 'nothing relevant')).toEqual(['Queue']);
  });

  it('trims labels before matching', () => {
    const graph = graphWith('  Order Service  ');

    expect(unmentionedNodeLabels(graph, 'the Order Service does the work')).toEqual([]);
  });
});
