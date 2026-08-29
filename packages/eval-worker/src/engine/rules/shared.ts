/**
 * Small helpers every rule file leans on. All pure; anything that could vary
 * by environment (locales, clocks) is reimplemented deterministically here.
 */
import { SUGGESTED_ID_PREFIX, type CanvasNode } from '@sysdesign/contracts';

import type { GraphIndex } from '../graph-index';

/**
 * Allocates ids for patch-introduced nodes/edges. Every id carries the
 * `suggested-` prefix and is checked against everything already on the canvas
 * (and everything already allocated), so an accepted patch can never collide.
 */
export class SuggestedIds {
  private readonly taken = new Set<string>();

  constructor(index: GraphIndex) {
    for (const node of index.graph.nodes) this.taken.add(node.id);
    for (const edge of index.graph.edges) this.taken.add(edge.id);
  }

  next(base: string): string {
    for (let counter = 1; ; counter += 1) {
      const id = `${SUGGESTED_ID_PREFIX}${base}-${counter}`;
      if (!this.taken.has(id)) {
        this.taken.add(id);
        return id;
      }
    }
  }
}

/** Stable ordering so rule output never depends on canvas insertion order. */
export function sortById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/** Reads a numeric config knob defensively — anything non-numeric is "unset". */
export function configNumber(node: CanvasNode, key: string): number | undefined {
  const value = node.config?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function replicasOf(node: CanvasNode): number {
  return configNumber(node, 'replicas') ?? 1;
}

/** '95:5' → 0.95. Null when the ratio cannot be parsed — rules then stay silent. */
export function readsFraction(readWriteRatio: string): number | null {
  const parts = readWriteRatio.split(':');
  if (parts.length !== 2) return null;
  const reads = Number.parseFloat(parts[0]);
  const writes = Number.parseFloat(parts[1]);
  if (!Number.isFinite(reads) || !Number.isFinite(writes) || reads < 0 || writes < 0) return null;
  const total = reads + writes;
  return total > 0 ? reads / total : null;
}

/** Deterministic thousands separator — toLocaleString varies by environment. */
export function formatInt(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * A service is "fronted" when some client reaches it, but only by passing a
 * load balancer or gateway — the structural complement of the raw-traffic
 * check in `reliability.service-no-lb`. Rules about what the edge tier can
 * fan out to (instance counts, capacity math) apply exactly to this set.
 */
export function frontedByEdgeTier(
  index: GraphIndex,
  clients: readonly CanvasNode[],
  service: CanvasNode,
): boolean {
  return clients.some(
    (client) =>
      index.pathExists(client.id, service.id) &&
      !index.pathExists(client.id, service.id, { avoidKinds: ['load-balancer', 'gateway'] }),
  );
}
