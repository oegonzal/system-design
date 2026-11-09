import { describe, expect, it } from 'vitest';

import { applyCanvasChange } from './canvas-change';
import { bestSubmission, changeOf, idsOf } from './canvas-change-fixtures';
import type { CanvasEdge } from './canvas.schema';
import { validateGraphReferences } from './graph-validator';

/** The graph after `edges` are upserted onto the best, nothing else named. */
const withEdges = (upsert: CanvasEdge[]) =>
  applyCanvasChange(bestSubmission(), changeOf({ edges: { upsert, remove: [] } })).graph;

describe('applyCanvasChange on the graph', () => {
  it('[QL-84] an upsert replaces a known id in place and appends a new one, so untouched positional ids keep their numbers', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        nodes: {
          upsert: [
            { id: 'n-2', kind: 'service', label: 'Order service', position: { x: 1, y: 1 } },
            { id: 'ai-cache', kind: 'cache', label: 'Order cache' },
          ],
          remove: [],
        },
        edges: {
          upsert: [{ id: 'e-1', source: 'n-1', target: 'n-2', kind: 'async' }],
          remove: [],
        },
      }),
    );
    expect(idsOf(applied.graph.nodes)).toEqual(['n-1', 'n-2', 'n-3', 'ai-cache']);
    expect(applied.graph.nodes[1]).toEqual({
      id: 'n-2',
      kind: 'service',
      label: 'Order service',
      position: { x: 1, y: 1 },
    });
    expect(applied.graph.edges[0]).toEqual({
      id: 'e-1',
      source: 'n-1',
      target: 'n-2',
      kind: 'async',
    });
    expect(applied.graph.edges[1]).toEqual(bestSubmission().graph.edges[1]);
  });

  it('[QL-84] a node upsert without a position keeps the best’s for that id; one with a position takes it; a new node without one has none', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        nodes: {
          upsert: [
            { id: 'n-3', kind: 'database', label: 'Orders store' },
            { id: 'n-2', kind: 'service', label: 'Order API', position: { x: 9, y: 9 } },
            { id: 'ai-cache', kind: 'cache', label: 'Order cache' },
          ],
          remove: [],
        },
      }),
    );
    expect(applied.graph.nodes[2].position).toEqual({ x: 400, y: 0 });
    expect(applied.graph.nodes[1].position).toEqual({ x: 9, y: 9 });
    expect('position' in applied.graph.nodes[3]).toBe(false);
  });

  it('[QL-84] removing a node removes every edge touching it, including one this change set added', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        nodes: { upsert: [], remove: ['n-3'] },
        edges: {
          upsert: [{ id: 'ai-e', source: 'n-2', target: 'n-3', kind: 'async' }],
          remove: [],
        },
      }),
    );
    expect(idsOf(applied.graph.nodes)).toEqual(['n-1', 'n-2']);
    expect(idsOf(applied.graph.edges)).toEqual(['e-1']);
  });

  it('[QL-84] an edge to a node that is not there is dropped, and so is one joining a node to itself; the rest of the change stands', () => {
    const graph = withEdges([
      { id: 'ai-dangling', source: 'n-2', target: 'nowhere', kind: 'sync' },
      { id: 'ai-loop', source: 'n-2', target: 'n-2', kind: 'sync' },
      { id: 'ai-kept', source: 'n-1', target: 'n-3', kind: 'async' },
    ]);
    expect(idsOf(graph.edges)).toEqual(['e-1', 'e-2', 'ai-kept']);
    expect(validateGraphReferences(graph)).toEqual([]);
  });

  it('[QL-84] a carried operation neither endpoint declares leaves its edge, once-repeated carries are said once, and an edge with nothing left to carry carries nothing; the edge stays', () => {
    const graph = withEdges([
      {
        id: 'ai-mixed',
        source: 'n-1',
        target: 'n-3',
        kind: 'sync',
        carries: ['write', 'ghost', 'write'],
      },
      { id: 'ai-ghosts', source: 'n-1', target: 'n-3', kind: 'async', carries: ['ghost'] },
    ]);
    expect(graph.edges[2]).toEqual({
      id: 'ai-mixed',
      source: 'n-1',
      target: 'n-3',
      kind: 'sync',
      carries: ['write'],
    });
    expect(graph.edges[3]).toEqual({
      id: 'ai-ghosts',
      source: 'n-1',
      target: 'n-3',
      kind: 'async',
    });
    // The best's own edges, which declared nothing wrong, are exactly as they were.
    expect(graph.edges.slice(0, 2)).toEqual(bestSubmission().graph.edges);
    expect(validateGraphReferences(graph)).toEqual([]);
  });

  it('[QL-84] a node rewritten without the operation an edge carried: the carry goes from the best’s edge, the edge stays', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        nodes: {
          upsert: [{ id: 'n-3', kind: 'database', label: 'Orders DB', operations: [] }],
          remove: [],
        },
      }),
    );
    expect(applied.graph.edges[1]).toEqual({
      id: 'e-2',
      source: 'n-2',
      target: 'n-3',
      kind: 'sync',
      label: 'writes',
    });
    expect(validateGraphReferences(applied.graph)).toEqual([]);
  });

  it('[QL-84] an unknown edge that repeats an existing source → target of the same kind replaces that edge in place and keeps its id; a different kind is a new edge; a known id stays its own edge', () => {
    const repeated = withEdges([
      { id: 'ai-dup', source: 'n-2', target: 'n-3', kind: 'sync', label: 'rewired' },
    ]);
    expect(idsOf(repeated.edges)).toEqual(['e-1', 'e-2']);
    expect(repeated.edges[1]).toEqual({
      id: 'e-2',
      source: 'n-2',
      target: 'n-3',
      kind: 'sync',
      label: 'rewired',
    });

    const otherKind = withEdges([{ id: 'ai-async', source: 'n-2', target: 'n-3', kind: 'async' }]);
    expect(idsOf(otherKind.edges)).toEqual(['e-1', 'e-2', 'ai-async']);

    // The coach rewired e-1 onto e-2's hop by its own id: two edges on one hop, as the validator allows.
    const rewired = withEdges([{ id: 'e-1', source: 'n-2', target: 'n-3', kind: 'sync' }]);
    expect(idsOf(rewired.edges)).toEqual(['e-1', 'e-2']);
    expect(rewired.edges[0]).toEqual({ id: 'e-1', source: 'n-2', target: 'n-3', kind: 'sync' });
  });

  it('[QL-84] a new edge on the hop of an edge this change set removes is the replacement under its own id, never folded onto the removed edge and lost with it; the removal may be positional', () => {
    const replacement: CanvasEdge = {
      id: 'ai-x',
      source: 'n-2',
      target: 'n-3',
      kind: 'sync',
      carries: ['write'],
    };
    for (const removal of ['e-2', 'edge.2']) {
      const applied = applyCanvasChange(
        bestSubmission(),
        changeOf({ edges: { upsert: [replacement], remove: [removal] } }),
      );
      expect(idsOf(applied.graph.edges), `removing ${removal}`).toEqual(['e-1', 'ai-x']);
      expect(applied.graph.edges[1]).toEqual(replacement);
      expect(validateGraphReferences(applied.graph)).toEqual([]);
    }
  });

  it('[QL-84] two new edges on one hop in one change set are one edge, the later rewriting the earlier under its id', () => {
    const graph = withEdges([
      { id: 'ai-first', source: 'n-1', target: 'n-3', kind: 'sync', label: 'first' },
      { id: 'ai-second', source: 'n-1', target: 'n-3', kind: 'sync', label: 'second' },
    ]);
    expect(idsOf(graph.edges)).toEqual(['e-1', 'e-2', 'ai-first']);
    expect(graph.edges[2].label).toBe('second');
  });
});
