import { describe, expect, it } from 'vitest';

import { makeFinding, makeGraph, makeInterfaceGraph } from '../../testing/fixtures';
import { createCanvasStore } from './canvas-store';

describe('canvas-store', () => {
  it('[UX-2] adds a node with a sequential id, default label, selection and dirty flag', () => {
    const store = createCanvasStore();

    const node = store.getState().addNode('database');

    expect(node.id).toBe('n-1');
    expect(node.data.label).toBe('Database');
    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().selectedId).toBe('n-1');
    expect(store.getState().dirty).toBe(true);
  });

  it('[UX-2] connects two nodes with a sync edge and rejects self-loops and duplicates', () => {
    const store = createCanvasStore();
    const a = store.getState().addNode('service');
    const b = store.getState().addNode('database');
    const connection = { source: a.id, target: b.id, sourceHandle: null, targetHandle: null };

    store.getState().onConnect(connection);
    expect(store.getState().edges).toHaveLength(1);
    expect(store.getState().edges[0].id).toBe('e-1');
    expect(store.getState().edges[0].data?.kind).toBe('sync');

    // Exact duplicate — rejected.
    store.getState().onConnect(connection);
    expect(store.getState().edges).toHaveLength(1);

    // Self-loop — rejected.
    store
      .getState()
      .onConnect({ source: a.id, target: a.id, sourceHandle: null, targetHandle: null });
    expect(store.getState().edges).toHaveLength(1);
  });

  it('[UX-2] updates node label, kind and config', () => {
    const store = createCanvasStore(makeGraph());

    store.getState().updateNode('n-2', { label: 'Checkout Service', kind: 'worker' });
    store.getState().updateNode('n-3', { config: { replicas: 3 } });

    const n2 = store.getState().nodes.find((node) => node.id === 'n-2');
    const n3 = store.getState().nodes.find((node) => node.id === 'n-3');
    expect(n2?.data.label).toBe('Checkout Service');
    expect(n2?.data.kind).toBe('worker');
    expect(n3?.data.config).toEqual({ replicas: 3 });
    expect(store.getState().dirty).toBe(true);
  });

  it('[UX-2] updates edge kind and label', () => {
    const store = createCanvasStore(makeGraph());

    store.getState().updateEdge('e-1', { kind: 'async', label: 'order events' });

    const edge = store.getState().edges.find((candidate) => candidate.id === 'e-1');
    expect(edge?.data?.kind).toBe('async');
    expect(edge?.label).toBe('order events');
  });

  it('updateEdge preserves carries on a kind-only patch and clears them on an empty list', () => {
    const store = createCanvasStore(makeInterfaceGraph());

    store.getState().updateEdge('e-2', { kind: 'async' });
    const patched = store.getState().edges.find((edge) => edge.id === 'e-2');
    expect(patched?.data?.kind).toBe('async');
    expect(patched?.data?.carries).toEqual(['PlaceOrder', 'GetOrder']);

    store.getState().updateEdge('e-2', { carries: [] });
    const cleared = store.getState().edges.find((edge) => edge.id === 'e-2');
    expect(cleared?.data?.carries).toEqual([]);
    // …and an emptied list serializes as an absent key.
    expect(
      store
        .getState()
        .serialize()
        .edges.find((edge) => edge.id === 'e-2'),
    ).not.toHaveProperty('carries');
  });

  it('updateNode carries responsibilities and operations through serialize', () => {
    const store = createCanvasStore(makeGraph());

    store.getState().updateNode('n-2', {
      responsibilities: ['Owns checkout'],
      operations: [{ name: 'Checkout', kind: 'command' }],
    });

    const serialized = store.getState().serialize();
    const node = serialized.nodes.find((candidate) => candidate.id === 'n-2');
    expect(node?.responsibilities).toEqual(['Owns checkout']);
    expect(node?.operations).toEqual([{ name: 'Checkout', kind: 'command' }]);
  });

  it('serialize round-trips the interface fixture unchanged', () => {
    const store = createCanvasStore(makeInterfaceGraph());
    expect(store.getState().serialize()).toEqual(makeInterfaceGraph());
  });

  it('[UX-2] removeSelected deletes a node together with its edges', () => {
    const store = createCanvasStore(makeGraph());

    store.getState().select('n-2');
    store.getState().removeSelected();

    expect(store.getState().nodes.map((node) => node.id)).toEqual(['n-1', 'n-3']);
    expect(store.getState().edges).toHaveLength(0);
    expect(store.getState().selectedId).toBeNull();
    expect(store.getState().dirty).toBe(true);
  });

  it('marks dirty and clears selection when React Flow removes the selected node', () => {
    const store = createCanvasStore(makeGraph());
    store.getState().select('n-1');
    store.getState().markClean();

    store.getState().onNodesChange([{ type: 'remove', id: 'n-1' }]);

    expect(store.getState().nodes.map((node) => node.id)).toEqual(['n-2', 'n-3']);
    expect(store.getState().selectedId).toBeNull();
    expect(store.getState().dirty).toBe(true);
  });

  it('setHighlight paints severity onto affected elements and clearHighlight wipes it', () => {
    const store = createCanvasStore(makeGraph());

    store.getState().setHighlight({ nodeIds: ['n-3'], edgeIds: ['e-2'], severity: 'high' });

    expect(store.getState().nodes.find((node) => node.id === 'n-3')?.data.severity).toBe('high');
    expect(
      store.getState().nodes.find((node) => node.id === 'n-1')?.data.severity ?? null,
    ).toBeNull();
    expect(store.getState().edges.find((edge) => edge.id === 'e-2')?.data?.severity).toBe('high');

    store.getState().clearHighlight();
    expect(store.getState().highlight).toBeNull();
    expect(store.getState().nodes.find((node) => node.id === 'n-3')?.data.severity).toBeNull();
  });

  it('[UX-2] previewPatch overlays ghosts and acceptGhost merges them into a dirty draft', () => {
    const store = createCanvasStore(makeGraph());
    store.getState().markClean();
    const finding = makeFinding();
    const suggestion = finding.suggestion;
    if (!suggestion) throw new Error('fixture should carry a suggestion');

    store.getState().previewPatch(suggestion, finding.id);

    const ghosts = store.getState().nodes.filter((node) => node.data.ghost);
    expect(ghosts.map((node) => node.id)).toEqual(['suggested-replica-1']);
    expect(store.getState().ghost?.findingId).toBe(finding.id);
    // Preview alone does not dirty the draft.
    expect(store.getState().dirty).toBe(false);

    store.getState().acceptGhost();

    const merged = store.getState();
    expect(merged.ghost).toBeNull();
    expect(merged.nodes.some((node) => node.data.ghost)).toBe(false);
    expect(merged.nodes.map((node) => node.id)).toContain('suggested-replica-1');
    expect(merged.edges.map((edge) => edge.id)).toContain('suggested-edge-1');
    expect(merged.dirty).toBe(true);
  });

  it('clearGhost removes the overlay without touching the real graph', () => {
    const store = createCanvasStore(makeGraph());
    const suggestion = makeFinding().suggestion;
    if (!suggestion) throw new Error('fixture should carry a suggestion');

    store.getState().previewPatch(suggestion, 'finding-1');
    store.getState().clearGhost();

    expect(store.getState().ghost).toBeNull();
    expect(store.getState().nodes).toHaveLength(3);
    expect(store.getState().edges).toHaveLength(2);
  });

  it('setGraph resets selection, dirty, ghost and highlight', () => {
    const store = createCanvasStore();
    store.getState().addNode('cache');
    store.getState().setHighlight({ nodeIds: ['n-1'], edgeIds: [], severity: 'low' });

    store.getState().setGraph(makeGraph());

    const state = store.getState();
    expect(state.nodes).toHaveLength(3);
    expect(state.selectedId).toBeNull();
    expect(state.dirty).toBe(false);
    expect(state.ghost).toBeNull();
    expect(state.highlight).toBeNull();
  });

  it('serialize returns the wire graph for the current canvas', () => {
    const store = createCanvasStore(makeGraph());
    expect(store.getState().serialize()).toEqual(makeGraph());
  });
});
