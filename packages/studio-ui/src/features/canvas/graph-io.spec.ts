import { canvasGraphSchema, LAYOUT_BLOCK, layoutGraph } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { makeGraph, makeInterfaceGraph } from '../../testing/canvas-fixtures';
import { grown, NODE_FOOTPRINT, NODE_GAP, overlaps } from './geometry';
import { fromCanvasGraph, toCanvasGraph } from './graph-io';
import { boxOf } from './placement';
import type { SdNode } from './types';

describe('graph-io', () => {
  it('[UX-3] round-trips a graph through React Flow shape and back, edge kinds included', () => {
    const graph = makeGraph({
      edges: [
        { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'async', label: 'events' },
        { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
      ],
    });

    const { nodes, edges } = fromCanvasGraph(graph);
    const roundTripped = toCanvasGraph(nodes, edges);

    expect(roundTripped).toEqual(graph);
  });

  it('[UX-3] rounds fractional positions to integers on serialization', () => {
    const { nodes, edges } = fromCanvasGraph(makeGraph());
    const dragged = nodes.map((node) =>
      node.id === 'n-1' ? { ...node, position: { x: 10.6, y: 19.4 } } : node,
    );

    const serialized = toCanvasGraph(dragged, edges);

    expect(serialized.nodes.find((node) => node.id === 'n-1')?.position).toEqual({
      x: 11,
      y: 19,
    });
  });

  it('round-trips config entries, responsibilities, operations and carries exactly and cloned', () => {
    const graph = makeInterfaceGraph();

    const { nodes, edges } = fromCanvasGraph(graph);
    const roundTripped = toCanvasGraph(nodes, edges);

    expect(roundTripped).toEqual(makeInterfaceGraph());
    // Deep-cloned both ways: the hydrated data never aliases the wire arrays.
    const hydratedOps = nodes.find((node) => node.id === 'n-3')?.data.operations;
    expect(hydratedOps).not.toBe(graph.nodes[2].operations);
    expect(hydratedOps?.[0]).not.toBe(graph.nodes[2].operations?.[0]);
    expect(nodes.find((node) => node.id === 'n-2')?.data.config?.[0]).not.toBe(
      graph.nodes[1].config?.[0],
    );
    expect(roundTripped.edges[1].carries).not.toBe(
      edges.find((edge) => edge.id === 'e-2')?.data?.carries,
    );
  });

  it('serializes empty lists as absent keys', () => {
    const graph = makeInterfaceGraph();
    graph.nodes[2] = { ...graph.nodes[2], responsibilities: [], operations: [], config: [] };
    graph.edges[1] = { ...graph.edges[1], carries: [] };

    const { nodes, edges } = fromCanvasGraph(graph);
    const serialized = toCanvasGraph(nodes, edges);

    const service = serialized.nodes.find((node) => node.id === 'n-3');
    expect(service).not.toHaveProperty('responsibilities');
    expect(service).not.toHaveProperty('operations');
    expect(service).not.toHaveProperty('config');
    expect(serialized.edges.find((edge) => edge.id === 'e-2')).not.toHaveProperty('carries');
  });

  /**
   * The API refuses a carry neither endpoint declares. A carry is kept while
   * either end still declares it — the queue's event on the consume edge, the
   * gateway's command on the client edge — and dropped once neither does.
   */
  it('[UX-5] keeps carries declared on either endpoint and drops the rest', () => {
    const { nodes, edges } = fromCanvasGraph(makeInterfaceGraph());
    const stale = edges.map((edge) =>
      edge.id === 'e-4'
        ? { ...edge, data: { kind: 'async' as const, carries: ['OrderPlaced', 'Vanished'] } }
        : edge,
    );

    const serialized = toCanvasGraph(nodes, stale);

    // e-1: client → gateway, PlaceOrder declared on the target.
    expect(serialized.edges.find((edge) => edge.id === 'e-1')?.carries).toEqual(['PlaceOrder']);
    // e-4: queue → worker, OrderPlaced declared on the source; Vanished on neither.
    expect(serialized.edges.find((edge) => edge.id === 'e-4')?.carries).toEqual(['OrderPlaced']);
  });

  it('[UX-15] leaves an operation row with no name yet off the wire, so the draft still passes the schema', () => {
    const { nodes, edges } = fromCanvasGraph(makeInterfaceGraph());
    const typing = nodes.map((node) =>
      node.id === 'n-3'
        ? {
            ...node,
            data: {
              ...node.data,
              operations: [...(node.data.operations ?? []), { name: '', kind: 'query' as const }],
            },
          }
        : node,
    );

    const serialized = toCanvasGraph(typing, edges);

    expect(serialized.nodes.find((node) => node.id === 'n-3')?.operations).toEqual(
      makeInterfaceGraph().nodes[2]?.operations,
    );
    expect(canvasGraphSchema.safeParse(serialized).success).toBe(true);

    // A node whose only row is still unnamed declares nothing at all.
    const onlyBlank = toCanvasGraph(
      [{ ...nodes[0], data: { ...nodes[0].data, operations: [{ name: '' }] } }],
      [],
    );
    expect(onlyBlank.nodes[0]).not.toHaveProperty('operations');
  });

  describe('nodes stored without a position', () => {
    const unplaced = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `ai-${index + 1}`,
        kind: 'service' as const,
        // As long as a label gets: the widest a block is ever drawn.
        label: `Service ${index + 1} with a label long enough to reach the widest a block can be`,
      }));

    /** No two blocks closer than the gap, even at their widest and before any is measured. */
    function expectClearOfEachOther(nodes: readonly SdNode[]) {
      const boxes = nodes.map(boxOf);
      for (const [index, a] of boxes.entries()) {
        for (const b of boxes.slice(index + 1)) {
          expect(overlaps(grown(a, NODE_GAP), b), `${nodes[index]?.id} crowds another block`).toBe(
            false,
          );
        }
      }
    }

    it('are laid out by the contract’s layout — the one the API gives a coach’s revision — so none overlaps another, however long the labels', () => {
      const graph = {
        nodes: unplaced(9),
        edges: [
          { id: 'e-1', source: 'ai-1', target: 'ai-2', kind: 'sync' as const },
          { id: 'e-2', source: 'ai-2', target: 'ai-3', kind: 'sync' as const },
        ],
      };

      const { nodes } = fromCanvasGraph(graph);

      expect(nodes.map((node) => node.position)).toEqual(
        layoutGraph(graph).nodes.map((node) => node.position),
      );
      expectClearOfEachOther(nodes);
    });

    it('never move the nodes that were placed, and never land on them — what the author arranged stays where it is', () => {
      const placed = makeGraph().nodes;
      const { nodes } = fromCanvasGraph({ nodes: [...placed, ...unplaced(5)], edges: [] });

      expect(nodes.slice(0, placed.length).map((node) => node.position)).toEqual(
        placed.map((node) => node.position),
      );
      expectClearOfEachOther(nodes);
    });

    it('the canvas draws and places by the block the layout assumes', () => {
      expect(NODE_FOOTPRINT).toEqual({ width: LAYOUT_BLOCK.width, height: LAYOUT_BLOCK.height });
      expect(NODE_GAP).toBe(LAYOUT_BLOCK.gap);
    });
  });

  it('drops an edge whose endpoint is no longer on the canvas', () => {
    const { nodes, edges } = fromCanvasGraph(makeGraph());
    const serialized = toCanvasGraph(
      nodes.filter((node) => node.id !== 'n-3'),
      edges,
    );
    expect(serialized.edges.map((edge) => edge.id)).toEqual(['e-1']);
  });
});
