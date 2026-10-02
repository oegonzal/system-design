import { nearestFreePlace, type CanvasSize, type PlaceDistance } from './canvas-geometry';
import type { CanvasGraph, CanvasNode } from './canvas.schema';

/**
 * Where a block goes when nobody said: under the blocks that call it, over
 * the ones it calls, in a free slot. A position is presentation — no lens
 * reads it and no grade depends on it — so it is the studio's to give, never
 * a model's: the coach revises a canvas it was shown as text, and what it
 * returns has no layout.
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

/**
 * How much dearer a step down a row is than a step across a column when a
 * block looks for a free place near where it belongs: a block pushed out of
 * its row goes a column over before it goes a row down, and a row down
 * before two columns over — so a block squeezed between two of its
 * neighbours in one row lands just under them, never at the row's far end.
 */
export const LAYOUT_ROW_COST = 2;

/**
 * The room one slot gives a block: a pitch less the gap, so two slots a
 * pitch apart are exactly one gap clear of each other. Every placed block is
 * taken to fill its room, whatever it is drawn at.
 */
const ROOM: CanvasSize = {
  width: LAYOUT_PITCH.x - LAYOUT_BLOCK.gap,
  height: LAYOUT_PITCH.y - LAYOUT_BLOCK.gap,
};

/** Distance in slots, a row costing `LAYOUT_ROW_COST` columns. */
const inSlots: PlaceDistance = (dx, dy) =>
  Math.hypot(dx / LAYOUT_PITCH.x, (dy / LAYOUT_PITCH.y) * LAYOUT_ROW_COST);

const centroid = (points: readonly CanvasPosition[]): CanvasPosition => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

/**
 * Which column the n-th block of a row takes, counting from the one its
 * neighbour sits in: the middle, then one right, one left, two right, two
 * left — a row grows outward from where it was started, both ways.
 */
const spread = (nth: number): number => (nth === 0 ? 0 : Math.ceil(nth / 2) * (nth % 2 ? 1 : -1));

/**
 * Where a block wants to be, from the placed blocks it is connected to. A
 * block's handles are on its top (what calls it) and bottom (what it calls),
 * so a path reads down the canvas: a block goes the row under the ones that
 * call it, the row over the ones it calls, between the two when it has both
 * — a block put into the middle of a path lands in the middle of it. Beside
 * the siblings already there: the callees of its caller spread across their
 * row, right then left, as the callers of its callee do. With no placed
 * neighbour it starts a new column beside everything placed, or the canvas
 * itself.
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
  const callerIds = graph.edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => edge.source);
  const calleeIds = graph.edges
    .filter((edge) => edge.source === node.id)
    .map((edge) => edge.target);
  const callers = placedAt(callerIds);
  const callees = placedAt(calleeIds);
  /** How many placed blocks already share one of these neighbours on the given side. */
  const siblings = (neighbours: readonly string[], side: 'source' | 'target'): number =>
    new Set(
      graph.edges
        .filter((edge) => neighbours.includes(edge[side === 'source' ? 'source' : 'target']))
        .map((edge) => edge[side === 'source' ? 'target' : 'source'])
        .filter((id) => id !== node.id && placed.has(id)),
    ).size;
  if (callers.length > 0 && callees.length > 0) {
    return centroid([centroid(callers), centroid(callees)]);
  }
  if (callers.length > 0) {
    const from = centroid(callers);
    const column = spread(siblings(callerIds, 'source'));
    return { x: from.x + column * LAYOUT_PITCH.x, y: from.y + LAYOUT_PITCH.y };
  }
  if (callees.length > 0) {
    const to = centroid(callees);
    const column = spread(siblings(calleeIds, 'target'));
    return { x: to.x + column * LAYOUT_PITCH.x, y: to.y - LAYOUT_PITCH.y };
  }
  const all = [...placed.values()];
  if (all.length === 0) return LAYOUT_ORIGIN;
  return {
    x: Math.max(...all.map((position) => position.x)) + LAYOUT_PITCH.x,
    y: Math.min(...all.map((position) => position.y)),
  };
}

/** The free slot nearest `anchor`, measured in slots, that crowds no placed block's room. */
function freeSlotNear(anchor: CanvasPosition, placed: readonly CanvasPosition[]): CanvasPosition {
  const origin = { x: Math.round(anchor.x), y: Math.round(anchor.y) };
  return (
    nearestFreePlace({
      origin,
      size: ROOM,
      taken: placed.map((position) => ({ ...position, ...ROOM })),
      gap: LAYOUT_BLOCK.gap,
      distance: inSlots,
    }) ?? origin
  );
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
 * neighbours, the best-connected first, so a new block lands under the ones
 * that call it, over the ones it calls, and never on top of one. Nodes, edges and their order are
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
