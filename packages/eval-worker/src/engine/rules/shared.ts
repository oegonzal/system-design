/**
 * Small helpers every rule file leans on. All pure; anything that could vary
 * by environment (locales, clocks) is reimplemented deterministically here.
 */
import { SUGGESTED_ID_PREFIX, type CanvasEdge, type CanvasNode } from '@sysdesign/contracts';

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
/**
 * Whether an edge mutates what it points at.
 *
 * Intent is optional, so absence has to mean "presume nothing has changed":
 * an undeclared edge counts as a possible writer exactly as it always did.
 * Declaring `read` is the only thing that buys an author out — which is why
 * declaring intent can clarify a design but never newly incriminate one.
 */
export function mayWrite(edge: CanvasEdge): boolean {
  return edge.intent !== 'read' && edge.intent !== 'consume';
}

/** Whether the author has said, in so many words, that this edge only reads. */
export function declaredReadOnly(edge: CanvasEdge): boolean {
  return edge.intent === 'read';
}

export function configNumber(node: CanvasNode, key: string): number | undefined {
  const value = node.config?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function replicasOf(node: CanvasNode): number {
  return configNumber(node, 'replicas') ?? 1;
}

/**
 * Every declared polling cadence attributable to one PULL-ingest fulfiller:
 * the node's own `pollIntervalSeconds`, plus every scheduler driving it
 * through a direct edge. Deliberately narrow — a push pipeline's internal
 * batch hops are NOT walked, because a shared indexer or resync edge would
 * cross-contaminate one ingest's budget with the other's cadence. Push
 * freshness is corroboration-only in v1; the hop analysis is future work.
 */
export function declaredPollIntervals(
  index: GraphIndex,
  fulfillerNodeId: string,
): Array<{ nodeId: string; seconds: number }> {
  const intervals: Array<{ nodeId: string; seconds: number }> = [];
  const self = index.byId(fulfillerNodeId);
  const own = self ? configNumber(self, 'pollIntervalSeconds') : undefined;
  if (own !== undefined) intervals.push({ nodeId: fulfillerNodeId, seconds: own });

  for (const edge of index.inEdges(fulfillerNodeId)) {
    const driver = index.byId(edge.source);
    if (driver?.kind !== 'scheduler') continue;
    const seconds = configNumber(driver, 'pollIntervalSeconds');
    if (seconds !== undefined) intervals.push({ nodeId: driver.id, seconds });
  }
  return intervals.sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1));
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
