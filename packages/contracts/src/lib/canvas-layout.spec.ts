import { describe, expect, it } from 'vitest';

import {
  LAYOUT_BLOCK,
  LAYOUT_ORIGIN,
  LAYOUT_PITCH,
  layoutGraph,
  positionsOf,
  type CanvasPosition,
} from './canvas-layout';
import type { CanvasEdge, CanvasGraph, CanvasNode } from './canvas.schema';

const node = (id: string, position?: CanvasPosition): CanvasNode => ({
  id,
  kind: 'service',
  label: id,
  ...(position ? { position } : {}),
});
const edge = (source: string, target: string): CanvasEdge => ({
  id: `${source}>${target}`,
  source,
  target,
  kind: 'sync',
});

/** No two blocks closer than a block and its gap: nothing sits on anything. */
function expectNoOverlap(graph: CanvasGraph): void {
  const positions = graph.nodes.map((n) => n.position);
  for (const [index, a] of positions.entries()) {
    expect(a, graph.nodes[index]?.id).toBeDefined();
    for (const b of positions.slice(index + 1)) {
      if (!a || !b) continue;
      const apart =
        Math.abs(a.x - b.x) >= LAYOUT_BLOCK.width + LAYOUT_BLOCK.gap ||
        Math.abs(a.y - b.y) >= LAYOUT_BLOCK.height + LAYOUT_BLOCK.gap;
      expect(apart, `${JSON.stringify(a)} crowds ${JSON.stringify(b)}`).toBe(true);
    }
  }
}

describe('layoutGraph', () => {
  // The author's arrangement, as a coach revision must keep it.
  const authored = (): CanvasGraph => ({
    nodes: [
      node('client', { x: 0, y: 0 }),
      node('gateway', { x: 300, y: 0 }),
      node('service', { x: 600, y: 0 }),
      node('db', { x: 900, y: 0 }),
    ],
    edges: [edge('client', 'gateway'), edge('gateway', 'service'), edge('service', 'db')],
  });

  it('keeps every position it is told to keep, exactly, and touches nothing but `position`', () => {
    const graph = authored();
    expect(layoutGraph(graph)).toEqual(graph);

    // What a coach hands back: the same nodes, their positions gone.
    const stripped: CanvasGraph = {
      ...graph,
      nodes: graph.nodes.map(({ position: _dropped, ...rest }) => rest),
    };
    expect(layoutGraph(stripped, positionsOf(graph))).toEqual(graph);
  });

  it('places a new block beside the blocks it joins — after its callers, before its callees, between the two — and never on one', () => {
    const base = authored();
    const coached: CanvasGraph = {
      nodes: [
        ...base.nodes.map(({ position: _dropped, ...rest }) => rest),
        node('ai-replica'),
        node('ai-lb'),
        node('ai-waf'),
      ],
      edges: [
        edge('client', 'gateway'),
        edge('gateway', 'ai-lb'),
        edge('ai-lb', 'service'),
        edge('service', 'db'),
        edge('db', 'ai-replica'),
        edge('ai-waf', 'client'),
      ],
    };
    const laid = layoutGraph(coached, positionsOf(base));
    const at = (id: string) => laid.nodes.find((n) => n.id === id)?.position;

    for (const original of base.nodes) expect(at(original.id)).toEqual(original.position);
    // After its one caller: a column to the right of the database.
    expect(at('ai-replica')).toEqual({ x: 900 + LAYOUT_PITCH.x, y: 0 });
    // Before its one callee: a column to the left of the client.
    expect(at('ai-waf')).toEqual({ x: 0 - LAYOUT_PITCH.x, y: 0 });
    // Between gateway (300) and service (600): the midpoint is taken by neither, so the slot under it.
    expect(at('ai-lb')).toEqual({ x: 450, y: LAYOUT_PITCH.y });
    expect(laid.nodes.map((n) => n.id)).toEqual(coached.nodes.map((n) => n.id));
    expect(laid.edges).toEqual(coached.edges);
    expectNoOverlap(laid);
  });

  it('lays out a graph with no positions at all: a path reads left to right, a fan-out stacks, and nothing overlaps', () => {
    const laid = layoutGraph({
      nodes: ['a', 'b', 'c1', 'c2', 'c3', 'lonely'].map((id) => node(id)),
      edges: [edge('a', 'b'), edge('b', 'c1'), edge('b', 'c2'), edge('b', 'c3')],
    });
    const at = (id: string) => laid.nodes.find((n) => n.id === id)?.position;
    expect(at('a')).toEqual(LAYOUT_ORIGIN);
    expect(at('b')).toEqual({ x: LAYOUT_PITCH.x, y: 0 });
    expect(at('c1')).toEqual({ x: 2 * LAYOUT_PITCH.x, y: 0 });
    expect(at('c2')).toEqual({ x: 2 * LAYOUT_PITCH.x, y: LAYOUT_PITCH.y });
    // Connected to nothing: a row of its own, under everything placed.
    expect(at('lonely')?.y).toBeGreaterThan(at('c2')?.y ?? 0);
    expectNoOverlap(laid);
  });

  it('is deterministic, and finds a slot however crowded the canvas is', () => {
    const hub = node('hub', { x: 0, y: 0 });
    const crowd: CanvasGraph = {
      nodes: [hub, ...Array.from({ length: 40 }, (_, index) => node(`ai-${index}`))],
      edges: Array.from({ length: 40 }, (_, index) => edge('hub', `ai-${index}`)),
    };
    const laid = layoutGraph(crowd);
    expect(laid).toEqual(layoutGraph(crowd));
    expectNoOverlap(laid);
  });

  it('declares a pitch no smaller than a block and its gap, so two slots can never crowd', () => {
    expect(LAYOUT_PITCH.x).toBeGreaterThanOrEqual(LAYOUT_BLOCK.width + LAYOUT_BLOCK.gap);
    expect(LAYOUT_PITCH.y).toBeGreaterThanOrEqual(LAYOUT_BLOCK.height + LAYOUT_BLOCK.gap);
  });
});
