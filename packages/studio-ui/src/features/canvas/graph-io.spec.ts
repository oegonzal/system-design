import { describe, expect, it } from 'vitest';

import { makeGraph, makeInterfaceGraph } from '../../testing/fixtures';
import { fromCanvasGraph, toCanvasGraph } from './graph-io';

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

  it('auto-grids nodes stored without a position', () => {
    const { nodes } = fromCanvasGraph({
      nodes: [
        { id: 'a', kind: 'service', label: 'A' },
        { id: 'b', kind: 'service', label: 'B' },
      ],
      edges: [],
    });

    expect(nodes[0].position).not.toEqual(nodes[1].position);
    expect(nodes.every((node) => Number.isFinite(node.position.x))).toBe(true);
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
