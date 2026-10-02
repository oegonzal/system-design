'use client';

import { useStoreApi, type XYPosition } from '@xyflow/react';
import { useLayoutEffect, useSyncExternalStore } from 'react';

import { measuredBoxes, type Size } from '../geometry';
import { placePills, pointAt, type Curve, type PillAsk } from './edge-path';

type FlowStore = ReturnType<typeof useStoreApi>;

/**
 * One canvas's pills, placed together. Each connection asks for its pill's
 * place with its line and laid-out size; the layout places every pill at
 * once (`placePills`) over the canvas's measured blocks, in the order of its
 * connections, and tells the pills when places may have moved — a pill
 * asked, changed or left, a block moved, a connection added. The places are
 * worked out once per change however many pills read them, and a place that
 * did not move keeps its identity, so its pill does not re-render.
 */
class PillLayout {
  private readonly asks = new Map<string, PillAsk>();
  private places = new Map<string, XYPosition>();
  private stale = false;
  private announcing = false;
  private readonly listeners = new Set<() => void>();
  private stopFollowing: (() => void) | null = null;

  constructor(private readonly flow: FlowStore) {}

  ask(ask: PillAsk): void {
    this.asks.set(ask.id, ask);
    this.changed();
  }

  withdraw(id: string): void {
    if (this.asks.delete(id)) this.changed();
  }

  /** Listens for moved places; the canvas's blocks and connections are followed while anyone listens. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.stopFollowing ??= this.flow.subscribe((state, previous) => {
      if (state.nodes !== previous.nodes || state.edges !== previous.edges) this.changed();
    });
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.stopFollowing?.();
      this.stopFollowing = null;
    };
  };

  /** Where the pill sits; undefined until it has asked. */
  placeOf(id: string): XYPosition | undefined {
    if (this.stale) this.placeAll();
    return this.places.get(id);
  }

  /**
   * Places are worked out when next read, and the listeners told once —
   * after the change that started it and every change made with it, such as
   * each pill asking as a canvas mounts.
   */
  private changed(): void {
    this.stale = true;
    if (this.announcing) return;
    this.announcing = true;
    queueMicrotask(() => {
      this.announcing = false;
      for (const listener of this.listeners) listener();
    });
  }

  private placeAll(): void {
    const { nodes, edges } = this.flow.getState();
    // The connections' order; a pill whose connection is not (yet) listed comes after, by id.
    const rank = new Map(edges.map((edge, index) => [edge.id, index]));
    const rankOf = (id: string): number => rank.get(id) ?? edges.length;
    const asks = [...this.asks.values()].sort(
      (a, b) => rankOf(a.id) - rankOf(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const next = placePills(asks, measuredBoxes(nodes));
    for (const [id, place] of next) {
      const before = this.places.get(id);
      if (before?.x === place.x && before.y === place.y) next.set(id, before);
    }
    this.places = next;
    this.stale = false;
  }
}

/**
 * One layout per React Flow store: every canvas has its own, and nothing has
 * to provide it. Keyed by the store's own `getState` — `useStoreApi` hands
 * each caller a wrapper of its own around the one store, and that function
 * is what every wrapper shares.
 */
const layouts = new WeakMap<FlowStore['getState'], PillLayout>();

function layoutOf(flow: FlowStore): PillLayout {
  let layout = layouts.get(flow.getState);
  if (layout === undefined) {
    layout = new PillLayout(flow);
    layouts.set(flow.getState, layout);
  }
  return layout;
}

/**
 * Where a connection's pill is centred among every pill on its canvas: on
 * its line, clear of the blocks and of the pills placed before it. The middle
 * of the line until the layout has placed it.
 */
export function usePillPlace(id: string, curve: Curve, size: Size | null): XYPosition {
  const layout = layoutOf(useStoreApi());
  // Before paint, so the pill is never seen where it is about to leave.
  useLayoutEffect(() => {
    layout.ask({ id, curve, size });
  }, [layout, id, curve, size]);
  useLayoutEffect(() => () => layout.withdraw(id), [layout, id]);
  const placeOf = () => layout.placeOf(id);
  const place = useSyncExternalStore(layout.subscribe, placeOf, placeOf);
  return place ?? pointAt(curve, 0.5);
}
