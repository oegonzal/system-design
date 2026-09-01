import { describe, expect, it } from 'vitest';

import type { CanvasGraph, NodeKind } from './canvas';
import {
  hasFlowStory,
  phantomMechanismTerms,
  unaddressedNfrKinds,
  unmentionedNodeLabels,
} from './narrative';

const graphWith = (...labels: string[]): CanvasGraph => ({
  nodes: labels.map((label, i) => ({ id: `n-${i}`, kind: 'service', label })),
  edges: [],
});

const graphOfKinds = (...kinds: NodeKind[]): CanvasGraph => ({
  nodes: kinds.map((kind, i) => ({ id: `n-${i}`, kind, label: `${kind} ${i}` })),
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

describe('hasFlowStory', () => {
  it('spots a flow verb regardless of case', () => {
    expect(hasFlowStory('The gateway ROUTES requests to the service.')).toBe(true);
  });

  it('is false for prose that only names parts', () => {
    expect(hasFlowStory('A gateway, a service, and a database.')).toBe(false);
  });
});

describe('unaddressedNfrKinds', () => {
  it('returns only the kinds the narrative never engages with, in canonical order', () => {
    const narrative = 'Reads stay under the p99 budget via the cache; the replica gives failover.';

    expect(unaddressedNfrKinds(['consistency', 'latency', 'availability'], narrative)).toEqual([
      'consistency',
    ]);
  });

  it('accepts any lexicon term for a kind', () => {
    expect(unaddressedNfrKinds(['consistency'], 'checkout is idempotent, never oversold')).toEqual(
      [],
    );
    expect(unaddressedNfrKinds(['throughput'], 'absorbs the 40k rps burst')).toEqual([]);
  });

  it('does not credit security for "author" or "authoritative"', () => {
    const narrative = 'The author made the database the authoritative store.';

    expect(unaddressedNfrKinds(['security'], narrative)).toEqual(['security']);
  });

  it('does not credit observability for "catalog"', () => {
    expect(unaddressedNfrKinds(['observability'], 'the product catalog service')).toEqual([
      'observability',
    ]);
  });

  it('is empty for an empty kind list', () => {
    expect(unaddressedNfrKinds([], 'anything at all')).toEqual([]);
  });
});

describe('phantomMechanismTerms', () => {
  it('flags a claimed mechanism the diagram never draws', () => {
    const graph = graphOfKinds('client', 'service', 'database');

    expect(phantomMechanismTerms(graph, 'Hot reads come from the cache.')).toEqual(['cache']);
  });

  it('accepts any satisfying kind — a CDN legitimately caches', () => {
    const graph = graphOfKinds('client', 'cdn', 'service');

    expect(phantomMechanismTerms(graph, 'The CDN caches images at the edge.')).toEqual([]);
  });

  it('lets an event stream stand in for a claimed queue', () => {
    const graph = graphOfKinds('service', 'event-stream');

    expect(phantomMechanismTerms(graph, 'Writes are queued for the workers.')).toEqual([]);
  });

  it('stays silent when the prose claims nothing', () => {
    const graph = graphOfKinds('client', 'service');

    expect(phantomMechanismTerms(graph, 'The client calls the service.')).toEqual([]);
  });
});
