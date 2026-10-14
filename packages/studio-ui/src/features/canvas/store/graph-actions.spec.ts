import { describe, expect, it } from 'vitest';

import { makeGraph, makeInterfaceGraph } from '../../../testing/canvas-fixtures';
import { createCanvasStore, type CanvasStore } from '../canvas-store';
import { viewArea } from '../framing';
import {
  contains,
  NODE_FOOTPRINT,
  NODE_GAP,
  NODE_MIN_FOOTPRINT,
  overlaps,
  type Box,
} from '../geometry';
import { boxOf } from '../placement';
import type { CanvasViewport } from './state';

describe('canvas-store', () => {
  it('[UX-2] adds a node with a sequential id, default label, selection and dirty flag', () => {
    const store = createCanvasStore();

    const node = store.getState().addNode('database');

    expect(node?.id).toBe('n-1');
    expect(node?.data.label).toBe('Database');
    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().selectedId).toBe('n-1');
    expect(store.getState().dirty).toBe(true);
  });

  it('[UX-2] connects two nodes with a sync edge and rejects self-loops and duplicates', () => {
    const store = createCanvasStore();
    store.getState().addNode('service');
    store.getState().addNode('database');
    const connection = { source: 'n-1', target: 'n-2', sourceHandle: null, targetHandle: null };

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
      .onConnect({ source: 'n-1', target: 'n-1', sourceHandle: null, targetHandle: null });
    expect(store.getState().edges).toHaveLength(1);
  });

  it('[UX-2] updates node label, kind and typed config entries', () => {
    const store = createCanvasStore(makeGraph());

    store.getState().updateNode('n-2', { label: 'Checkout Service', kind: 'worker' });
    store.getState().updateNode('n-3', {
      config: [
        { key: 'replicas', value: 3 },
        { key: 'backups', value: true },
      ],
    });

    const n2 = store.getState().nodes.find((node) => node.id === 'n-2');
    const n3 = store.getState().nodes.find((node) => node.id === 'n-3');
    expect(n2?.data.label).toBe('Checkout Service');
    expect(n2?.data.kind).toBe('worker');
    expect(n3?.data.config).toEqual([
      { key: 'replicas', value: 3 },
      { key: 'backups', value: true },
    ]);
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

  describe('placing a block', () => {
    /** A canvas on screen: an 800 × 600 pane at 100%, unpanned, that records what it is asked to show. */
    function attachCanvas(store: CanvasStore, pane = { width: 800, height: 600 }) {
      const revealed: Box[] = [];
      const viewport: CanvasViewport = {
        area: () => viewArea(pane, [0, 0, 1]),
        reveal: (box) => revealed.push(box),
      };
      store.getState().attachViewport(viewport);
      const clear = viewport.area()?.clear;
      if (!clear) throw new Error('the test pane has no size');
      return { revealed, clear };
    }

    it('[UX-2] centres a click-added block in what the canvas reports the author can see in full', () => {
      const store = createCanvasStore();
      const { clear, revealed } = attachCanvas(store);

      const node = store.getState().addNode('cache');

      expect(node?.position).toEqual({
        x: clear.width / 2 - NODE_FOOTPRINT.width / 2,
        y: clear.height / 2 - NODE_FOOTPRINT.height / 2,
      });
      expect(revealed).toEqual([]);
    });

    it('[UX-2] keeps consecutive adds a gap clear of each other and on screen', () => {
      const store = createCanvasStore();
      const { clear, revealed } = attachCanvas(store);

      for (const kind of ['client', 'cdn', 'dns', 'service'] as const)
        store.getState().addNode(kind);

      const boxes = store.getState().nodes.map(boxOf);
      for (const [index, a] of boxes.entries()) {
        expect(contains(clear, a)).toBe(true);
        for (const b of boxes.slice(index + 1)) {
          const grown = {
            x: a.x - NODE_GAP,
            y: a.y - NODE_GAP,
            width: a.width + NODE_GAP * 2,
            height: a.height + NODE_GAP * 2,
          };
          expect(overlaps(grown, b)).toBe(false);
        }
      }
      expect(revealed).toEqual([]);
    });

    it('[UX-2] on a canvas with no visible room left, adds beside what is visible and has the view show the new block', () => {
      const store = createCanvasStore();
      // A pane with room for exactly one block that nothing floats over.
      const { clear, revealed } = attachCanvas(store, {
        width: NODE_FOOTPRINT.width + NODE_GAP,
        height: 200,
      });

      const first = store.getState().addNode('client');
      expect(first && contains(clear, boxOf(first))).toBe(true);
      expect(revealed).toEqual([]);

      const second = store.getState().addNode('service');
      expect(second && contains(clear, boxOf(second))).toBe(false);
      expect(second && first && overlaps(boxOf(second), boxOf(first))).toBe(false);
      expect(revealed).toEqual([{ ...second?.position, ...NODE_FOOTPRINT }]);
    });

    it('[UX-2] a dropped block lands exactly where it was dropped', () => {
      const store = createCanvasStore();
      store.getState().addNode('queue', { x: 12, y: 34 });
      expect(store.getState().nodes[0]?.position).toEqual({ x: 12, y: 34 });

      const { revealed } = attachCanvas(store);
      store.getState().addNode('cache', { x: 300, y: 500 });
      // Under the minimap's band is still on the pane: the author chose it.
      expect(store.getState().nodes[1]?.position).toEqual({ x: 300, y: 500 });
      expect(revealed).toEqual([]);
    });

    it('[UX-2] a drop past the pane’s edge is pulled back onto it, never left out of sight', () => {
      const store = createCanvasStore();
      attachCanvas(store, { width: 692, height: 600 });

      const node = store.getState().addNode('cache', { x: 780, y: 280 });

      expect(node?.position).toEqual({ x: 692 - NODE_MIN_FOOTPRINT.width, y: 280 });
    });
  });
});
