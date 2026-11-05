/** How far apart, in flow units, two connections between the same blocks are drawn. */
export const PARALLEL_LANE_GAP = 24;

interface Joined {
  id: string;
  source: string;
  target: string;
}

/**
 * The lane a connection takes among those joining the same two blocks, either
 * way round: lanes are centred on the straight line between them and given in
 * connection order, so an older connection keeps its lane when a new one is
 * drawn, and a connection alone is drawn where it always was. The sign is
 * taken in one orientation of the pair, so a connection drawn back the other
 * way bends to the other side rather than onto its twin.
 */
export function laneOf(edges: readonly Joined[], edge: Joined): number {
  const pair = new Set([edge.source, edge.target]);
  const siblings = edges.filter(
    (candidate) =>
      candidate.source !== candidate.target &&
      pair.has(candidate.source) &&
      pair.has(candidate.target),
  );
  const index = siblings.findIndex((candidate) => candidate.id === edge.id);
  if (index < 0 || siblings.length < 2) return 0;
  const lane = index - (siblings.length - 1) / 2;
  return edge.source <= edge.target ? lane : -lane;
}
