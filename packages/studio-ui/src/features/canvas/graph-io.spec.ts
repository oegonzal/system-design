import type { GraphPatch } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { makeGraph, makeInterfaceGraph } from '../../testing/fixtures';
import { applySuggestionPatch, fromCanvasGraph, toCanvasGraph, toGhostElements } from './graph-io';
import type { SdEdge, SdNode } from './types';

describe('graph-io', () => {
  it('[UX-3] round-trips a graph through React Flow shape and back, edge kinds included', () => {
    const graph = makeGraph({
      edges: [
        { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'async', label: 'events' },
        { id: 'e-2', source: 'n-2', target: 'n-3' }, // kind omitted → sync
      ],
    });

    const { nodes, edges } = fromCanvasGraph(graph);
    const roundTripped = toCanvasGraph(nodes, edges);

    expect(roundTripped.nodes).toEqual(graph.nodes);
    expect(roundTripped.edges).toEqual([
      { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'async', label: 'events' },
      { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
    ]);
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

  it('round-trips interface fields — responsibilities, operations, carries — exactly and cloned', () => {
    const graph = makeInterfaceGraph();

    const { nodes, edges } = fromCanvasGraph(graph);
    const roundTripped = toCanvasGraph(nodes, edges);

    expect(roundTripped).toEqual(makeInterfaceGraph());
    // Deep-cloned both ways: the hydrated data never aliases the wire arrays.
    const hydratedOps = nodes.find((node) => node.id === 'n-3')?.data.operations;
    expect(hydratedOps).not.toBe(graph.nodes[2].operations);
    expect(hydratedOps?.[0]).not.toBe(graph.nodes[2].operations?.[0]);
    expect(roundTripped.edges[1].carries).not.toBe(
      edges.find((edge) => edge.id === 'e-2')?.data?.carries,
    );
  });

  it('serializes empty interface arrays as absent keys', () => {
    const graph = makeInterfaceGraph();
    graph.nodes[2] = { ...graph.nodes[2], responsibilities: [], operations: [] };
    graph.edges[1] = { ...graph.edges[1], carries: [] };

    const { nodes, edges } = fromCanvasGraph(graph);
    const serialized = toCanvasGraph(nodes, edges);

    const service = serialized.nodes.find((node) => node.id === 'n-3');
    expect(service).not.toHaveProperty('responsibilities');
    expect(service).not.toHaveProperty('operations');
    expect(serialized.edges.find((edge) => edge.id === 'e-2')).not.toHaveProperty('carries');
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

  it('strips ghost nodes, ghost edges, and edges touching ghost nodes', () => {
    const { nodes, edges } = fromCanvasGraph(makeGraph());
    const ghostNode: SdNode = {
      id: 'suggested-x',
      type: 'sd',
      position: { x: 0, y: 0 },
      data: { kind: 'replica', label: 'Ghost', ghost: true },
    };
    const ghostEdge: SdEdge = {
      id: 'suggested-e',
      type: 'sd',
      source: 'n-1',
      target: 'n-2',
      data: { kind: 'sync', ghost: true },
    };
    const edgeToGhost: SdEdge = {
      id: 'e-to-ghost',
      type: 'sd',
      source: 'n-1',
      target: 'suggested-x',
      data: { kind: 'sync' },
    };

    const serialized = toCanvasGraph([...nodes, ghostNode], [...edges, ghostEdge, edgeToGhost]);

    expect(serialized.nodes.map((node) => node.id)).toEqual(['n-1', 'n-2', 'n-3']);
    expect(serialized.edges.map((edge) => edge.id)).toEqual(['e-1', 'e-2']);
  });

  describe('applySuggestionPatch', () => {
    const patch: GraphPatch = {
      description: 'Add a read replica.',
      ops: [
        {
          op: 'add-node',
          node: { id: 'suggested-r', kind: 'replica', label: 'Read Replica' },
        },
        {
          op: 'add-edge',
          edge: { id: 'suggested-e', source: 'n-3', target: 'suggested-r', kind: 'async' },
        },
        { op: 'remove-edge', edgeId: 'e-2' },
        { op: 'update-node', nodeId: 'n-3', set: { config: { replicas: 2 } } },
      ],
    };

    it('applies every op kind and stays pure', () => {
      const graph = makeGraph();
      const result = applySuggestionPatch(graph, patch);

      expect(result.nodes.map((node) => node.id)).toContain('suggested-r');
      expect(result.edges.map((edge) => edge.id)).toContain('suggested-e');
      expect(result.edges.map((edge) => edge.id)).not.toContain('e-2');
      expect(result.nodes.find((node) => node.id === 'n-3')?.config).toEqual({ replicas: 2 });
      // The input graph is untouched.
      expect(graph.edges.map((edge) => edge.id)).toContain('e-2');
      expect(graph.nodes.find((node) => node.id === 'n-3')?.config).toEqual({ replicas: 1 });
    });

    it('update-edge merges its set wholesale and skips unknown ids', () => {
      const graph = makeInterfaceGraph();
      const edgePatch: GraphPatch = {
        description: 'Trim the call edge to a single carry.',
        ops: [
          { op: 'update-edge', edgeId: 'e-2', set: { kind: 'async', carries: ['PlaceOrder'] } },
          { op: 'update-edge', edgeId: 'nope', set: { label: 'Nope' } },
        ],
      };

      const result = applySuggestionPatch(graph, edgePatch);

      const updated = result.edges.find((edge) => edge.id === 'e-2');
      expect(updated?.kind).toBe('async');
      // Whole replacement, not a merge of the two carries lists.
      expect(updated?.carries).toEqual(['PlaceOrder']);
      expect(result.edges).toHaveLength(graph.edges.length);
      // The input stayed pure.
      expect(graph.edges[1].carries).toEqual(['PlaceOrder', 'GetOrder']);
    });

    it('remove-node drops the node together with every touching edge', () => {
      const graph = makeInterfaceGraph();
      const removal: GraphPatch = {
        description: 'Remove the queue.',
        ops: [{ op: 'remove-node', nodeId: 'n-4' }],
      };

      const result = applySuggestionPatch(graph, removal);

      expect(result.nodes.map((node) => node.id)).toEqual(['n-1', 'n-2', 'n-3', 'n-5']);
      expect(result.edges.map((edge) => edge.id)).toEqual(['e-1', 'e-2']);
    });

    it('update-node replaces operations wholesale, never merging lists', () => {
      const graph = makeInterfaceGraph();
      const replacement: GraphPatch = {
        description: 'Collapse the service interface to a single command.',
        ops: [
          {
            op: 'update-node',
            nodeId: 'n-3',
            set: { operations: [{ name: 'SubmitOrder', kind: 'command' }] },
          },
        ],
      };

      const result = applySuggestionPatch(graph, replacement);

      expect(result.nodes.find((node) => node.id === 'n-3')?.operations).toEqual([
        { name: 'SubmitOrder', kind: 'command' },
      ]);
    });

    it('defensively skips ops referencing unknown or colliding ids', () => {
      const graph = makeGraph();
      const hostile: GraphPatch = {
        description: 'Ops against a drifted graph.',
        ops: [
          { op: 'add-node', node: { id: 'n-1', kind: 'cache', label: 'Collision' } },
          {
            op: 'add-edge',
            edge: { id: 'suggested-dangling', source: 'n-1', target: 'nope' },
          },
          { op: 'remove-edge', edgeId: 'nope' },
          { op: 'update-node', nodeId: 'nope', set: { label: 'Nope' } },
        ],
      };

      const result = applySuggestionPatch(graph, hostile);

      expect(result.nodes).toHaveLength(graph.nodes.length);
      expect(result.nodes.find((node) => node.id === 'n-1')?.kind).toBe('client');
      expect(result.edges).toHaveLength(graph.edges.length);
    });
  });

  describe('toGhostElements', () => {
    it('emits ghost-flagged elements with suggested ids kept as-is', () => {
      const patch: GraphPatch = {
        description: 'Add a replica.',
        ops: [
          {
            op: 'add-node',
            node: { id: 'suggested-r', kind: 'replica', label: 'Read Replica' },
          },
          {
            op: 'add-edge',
            edge: { id: 'suggested-e', source: 'n-3', target: 'suggested-r' },
          },
          {
            op: 'add-edge',
            edge: { id: 'suggested-dangling', source: 'ghost-town', target: 'n-1' },
          },
        ],
      };

      const { nodes, edges } = toGhostElements(patch, makeGraph());

      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('suggested-r');
      expect(nodes[0].data.ghost).toBe(true);
      // The edge whose endpoints exist (n-3 + the ghost node) renders…
      expect(edges.map((edge) => edge.id)).toEqual(['suggested-e']);
      expect(edges[0].data?.ghost).toBe(true);
      // …the dangling one does not.
    });

    it('passes carries through to ghost add-edge data', () => {
      const patch: GraphPatch = {
        description: 'Route order reads through the replica.',
        ops: [
          {
            op: 'add-edge',
            edge: { id: 'suggested-e', source: 'n-1', target: 'n-2', carries: ['GetOrder'] },
          },
        ],
      };

      const { edges } = toGhostElements(patch, makeGraph());

      expect(edges[0].data?.carries).toEqual(['GetOrder']);
      expect(edges[0].data?.ghost).toBe(true);
    });
  });
});
