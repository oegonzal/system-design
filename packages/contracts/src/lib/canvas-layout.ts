import type { CanvasGraph, CanvasNode } from './canvas.schema';

/**
 * Where a block goes when nobody said: beside the blocks it is connected to,
 * in a free slot. A position is presentation — no lens reads it and no grade
 * depends on it — so it is the studio's to give, never a model's: the coach
 * revises a canvas it was shown as text, and what it returns has no layout.
 * The API lays an imported revision out with this before it stores it, and
 * the canvas lays out any stored graph that still lacks positions the same
 * way, so the two can never place a block differently.
 *
 * Deterministic: the same graph and the same kept positions give the same
 * layout, whoever asks.
 */

export interface CanvasPosition {
  x: number;
  y: number;
}

/**
 * The room one block is laid out in — the widest a block is drawn and the
 * height it is assumed to have — and the clear space kept around it: room
 * for its handles and a connection.
 */
export const LAYOUT_BLOCK = { width: 220, height: 56, gap: 24 } as const;

/**
 * How far apart the slots a block may be placed in are: a block, plus room
 * between two of them for a connection and its label. Never less than a
 * block and its gap, so two placed blocks cannot crowd each other.
 */
export const LAYOUT_PITCH = { x: 340, y: 136 } as const;

/** Where the first block goes on a canvas with nothing placed. */
export const LAYOUT_ORIGIN: CanvasPosition = { x: 0, y: 0 };

/** Two blocks closer than the gap: one would sit on the other's handles. */
const crowds = (a: CanvasPosition, b: CanvasPosition): boolean =>
  Math.abs(a.x - b.x) < LAYOUT_BLOCK.width + LAYOUT_BLOCK.gap &&
  Math.abs(a.y - b.y) < LAYOUT_BLOCK.height + LAYOUT_BLOCK.gap;

const centroid = (points: readonly CanvasPosition[]): CanvasPosition => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

/**
 * The slots of one ring around an anchor, in slot units, nearest first. Ties
 * go below, then right, then left, then above — a column grows downward from
 * where its neighbours are.
 */
function ringOffsets(ring: number): [number, number][] {
  const offsets: [number, number][] = [];
  for (let row = -ring; row <= ring; row += 1) {
    for (let col = -ring; col <= ring; col += 1) {
      if (Math.max(Math.abs(row), Math.abs(col)) === ring) offsets.push([col, row]);
    }
  }
  return offsets.sort(
    ([colA, rowA], [colB, rowB]) =>
      Math.hypot(colA, rowA) - Math.hypot(colB, rowB) || rowB - rowA || colB - colA,
  );
}

/** The free slot nearest `anchor`: the first, ring by ring, that crowds no placed block. */
function freeSlotNear(anchor: CanvasPosition, placed: readonly CanvasPosition[]): CanvasPosition {
  // A placed block crowds at most four slots, so a ring this wide always holds a free one.
  const widest = Math.ceil(Math.sqrt(placed.length)) + 1;
  for (let ring = 0; ring <= widest; ring += 1) {
    for (const [col, row] of ringOffsets(ring)) {
      const slot = {
        x: Math.round(anchor.x + col * LAYOUT_PITCH.x),
        y: Math.round(anchor.y + row * LAYOUT_PITCH.y),
      };
      if (!placed.some((position) => crowds(slot, position))) return slot;
    }
  }
  return { x: Math.round(anchor.x), y: Math.round(anchor.y) };
}

/**
 * Where a block wants to be, from the placed blocks it is connected to: one
 * column after the ones that call it, one column before the ones it calls,
 * between the two when it has both — a block put into the middle of a path
 * lands in the middle of it. With no placed neighbour it starts a new row
 * under everything placed, or the canvas itself.
 */
function anchorFor(
  node: CanvasNode,
  graph: CanvasGraph,
  placed: ReadonlyMap<string, CanvasPosition>,
): CanvasPosition {
  const placedAt = (ids: readonly string[]): CanvasPosition[] =>
    ids.flatMap((id) => {
      const position = placed.get(id);
      return position ? [position] : [];
    });
  const callers = placedAt(
    graph.edges.filter((edge) => edge.target === node.id).map((edge) => edge.source),
  );
  const callees = placedAt(
    graph.edges.filter((edge) => edge.source === node.id).map((edge) => edge.target),
  );
  if (callers.length > 0 && callees.length > 0) {
    return centroid([centroid(callers), centroid(callees)]);
  }
  if (callers.length > 0) {
    const from = centroid(callers);
    return { x: from.x + LAYOUT_PITCH.x, y: from.y };
  }
  if (callees.length > 0) {
    const to = centroid(callees);
    return { x: to.x - LAYOUT_PITCH.x, y: to.y };
  }
  const all = [...placed.values()];
  if (all.length === 0) return LAYOUT_ORIGIN;
  return {
    x: Math.min(...all.map((position) => position.x)),
    y: Math.max(...all.map((position) => position.y)) + LAYOUT_PITCH.y,
  };
}

/** Each node's own stored position, by id — the layout a graph already has. */
export const positionsOf = (graph: CanvasGraph): Map<string, CanvasPosition> =>
  new Map(
    graph.nodes.flatMap((node) =>
      node.position ? [[node.id, { ...node.position }] as const] : [],
    ),
  );

/**
 * `graph` with every node positioned. A node `keep` holds a position for
 * stays exactly there — by default the position each node already has — and
 * every other node is placed in the free slot nearest its connected
 * neighbours, the best-connected first, so a new block lands beside the ones
 * it joins and never on top of one. Nodes, edges and their order are
 * untouched: only `position` is written.
 */
export function layoutGraph(
  graph: CanvasGraph,
  keep: ReadonlyMap<string, CanvasPosition> = positionsOf(graph),
): CanvasGraph {
  const placed = new Map<string, CanvasPosition>();
  for (const node of graph.nodes) {
    const kept = keep.get(node.id);
    if (kept) placed.set(node.id, { x: kept.x, y: kept.y });
  }
  const neighbours = new Map<string, Set<string>>(graph.nodes.map((node) => [node.id, new Set()]));
  for (const edge of graph.edges) {
    neighbours.get(edge.source)?.add(edge.target);
    neighbours.get(edge.target)?.add(edge.source);
  }
  const placedNeighbours = (node: CanvasNode): number =>
    [...(neighbours.get(node.id) ?? [])].filter((id) => placed.has(id)).length;

  let waiting = graph.nodes.filter((node) => !placed.has(node.id));
  while (waiting.length > 0) {
    // The block with the most placed neighbours knows best where it belongs; ties keep graph order.
    const next = waiting.reduce((best, node) =>
      placedNeighbours(node) > placedNeighbours(best) ? node : best,
    );
    placed.set(next.id, freeSlotNear(anchorFor(next, graph, placed), [...placed.values()]));
    waiting = waiting.filter((node) => node !== next);
  }
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const position = placed.get(node.id);
      return position ? { ...node, position } : node;
    }),
  };
}
