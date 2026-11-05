import { describe, expect, it } from 'vitest';

import { laneOf } from './parallel-edges';

const edge = (id: string, source: string, target: string) => ({ id, source, target });

describe('laneOf', () => {
  it('[UX-3] a connection alone is drawn where it always was', () => {
    const edges = [edge('e-1', 'a', 'b'), edge('e-2', 'b', 'c')];
    expect(laneOf(edges, edges[0])).toBe(0);
    expect(laneOf(edges, edges[1])).toBe(0);
  });

  it('[UX-3] two connections between the same blocks take lanes either side of the line, in connection order', () => {
    const edges = [edge('e-1', 'a', 'b'), edge('e-2', 'a', 'b')];
    expect(laneOf(edges, edges[0])).toBe(-0.5);
    expect(laneOf(edges, edges[1])).toBe(0.5);
  });

  it('[UX-3] a connection drawn back the other way takes the other side of the same pair, never its twin’s lane', () => {
    const edges = [edge('e-1', 'a', 'b'), edge('e-2', 'b', 'a')];
    // In the pair's one orientation (a→b) the lanes read -0.5 and +0.5; the
    // reversed edge's own frame flips its perpendicular, so its sign flips too.
    expect(laneOf(edges, edges[0])).toBe(-0.5);
    expect(laneOf(edges, edges[1])).toBe(-0.5);
  });

  it('[UX-3] a connection the list does not hold, or a self-loop, is drawn in lane 0', () => {
    const edges = [edge('e-1', 'a', 'b'), edge('e-2', 'a', 'b')];
    expect(laneOf(edges, edge('e-9', 'a', 'b'))).toBe(0);
    expect(laneOf([edge('e-1', 'a', 'a'), edge('e-2', 'a', 'a')], edge('e-1', 'a', 'a'))).toBe(0);
  });
});
