import { describe, expect, it } from 'vitest';

import { buildGraphIndex } from './graph-index';
import { edge, graph, node } from './testing';

// client → service → database, plus a floating scheduler nobody wired in.
const sample = graph(
  [node('a', 'client'), node('b', 'service'), node('c', 'database'), node('d', 'scheduler')],
  [edge('e1', 'a', 'b'), edge('e2', 'b', 'c', 'async')],
);

describe('GraphIndex', () => {
  const index = buildGraphIndex(sample);

  it('indexes nodes by id and kind', () => {
    expect(index.byId('a')?.kind).toBe('client');
    expect(index.byId('missing')).toBeUndefined();
    expect(index.byKind('service').map((n) => n.id)).toEqual(['b']);
    expect(index.byKind('cdn')).toEqual([]);
    expect(index.kinds()).toEqual(new Set(['client', 'service', 'database', 'scheduler']));
    expect(index.clients().map((n) => n.id)).toEqual(['a']);
  });

  it('defaults an edge with no kind to sync', () => {
    expect(index.edgeKind(sample.edges[0])).toBe('sync');
    expect(index.edgeKind(sample.edges[1])).toBe('async');
  });

  it('tracks in/out edges and degree', () => {
    expect(index.outEdges('a').map((e) => e.id)).toEqual(['e1']);
    expect(index.inEdges('c').map((e) => e.id)).toEqual(['e2']);
    expect(index.degree('b')).toBe(2);
    expect(index.degree('d')).toBe(0);
    expect(index.neighbors('b').map((n) => n.id)).toEqual(['c', 'a']);
  });

  it('computes directed and undirected reachability', () => {
    expect(index.reachableFrom(['a'])).toEqual(new Set(['a', 'b', 'c']));
    expect(index.reachableFrom(['c'], { direction: 'in' })).toEqual(new Set(['a', 'b', 'c']));
    expect(index.reachableFrom(['b'], { direction: 'both' })).toEqual(new Set(['a', 'b', 'c']));
    expect(index.reachableFrom(['missing'])).toEqual(new Set());
  });

  it('answers path existence with direction control', () => {
    expect(index.pathExists('a', 'c')).toBe(true);
    expect(index.pathExists('c', 'a')).toBe(false);
    expect(index.pathExists('c', 'a', { direction: 'both' })).toBe(true);
    expect(index.pathExists('a', 'a')).toBe(true);
    expect(index.pathExists('a', 'missing')).toBe(false);
  });

  it('bans avoided kinds as intermediate hops but not as endpoints', () => {
    expect(index.pathExists('a', 'c', { avoidKinds: ['service'] })).toBe(false);
    expect(index.pathExists('a', 'b', { avoidKinds: ['service'] })).toBe(true);
  });

  it('survives an empty graph', () => {
    const empty = buildGraphIndex(graph([]));
    expect(empty.nodes()).toEqual([]);
    expect(empty.pathExists('x', 'y')).toBe(false);
    expect(empty.reachableFrom(['x'])).toEqual(new Set());
  });
});
