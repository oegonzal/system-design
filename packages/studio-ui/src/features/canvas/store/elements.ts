import type { Severity } from '@sysdesign/contracts';
import type { EdgeChange, NodeChange } from '@xyflow/react';

import type { SdEdge, SdNode } from '../types';

/**
 * React Flow change types that describe the view, not the design: what is
 * selected and how big a block measured. Everything else edits the graph.
 */
const VIEW_CHANGE_TYPES: ReadonlySet<string> = new Set(['select', 'dimensions']);

export const isViewChange = (change: { type: string }): boolean =>
  VIEW_CHANGE_TYPES.has(change.type);

/** `n-7` style ids: one past the highest existing suffix, never a collision. */
export function nextId(prefix: 'n' | 'e', existing: { id: string }[]): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const { id } of existing) {
    const match = pattern.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  let candidate = `${prefix}-${max + 1}`;
  // Belt and braces against non-sequential ids that happen to look sequential.
  while (existing.some(({ id }) => id === candidate)) {
    max += 1;
    candidate = `${prefix}-${max + 1}`;
  }
  return candidate;
}

/** Write highlight severity onto the affected elements' data, null elsewhere. */
export function paintSeverity<T extends SdNode | SdEdge>(
  elements: T[],
  ids: Set<string>,
  severity: Severity | null,
): T[] {
  return elements.map((element) => {
    const next = ids.has(element.id) ? severity : null;
    const current = element.data?.severity ?? null;
    if (current === next) return element;
    return { ...element, data: { ...element.data, severity: next } } as T;
  });
}

/** Each edge's positions in a walk, 1-based; a revisited edge gets every position it holds. */
export function pathOrdinals(path: readonly string[]): Map<string, number[]> {
  const ordinals = new Map<string, number[]>();
  path.forEach((edgeId, index) => {
    ordinals.set(edgeId, [...(ordinals.get(edgeId) ?? []), index + 1]);
  });
  return ordinals;
}

const sameSequence = (a: number[] | undefined, b: number[] | undefined): boolean =>
  a === b ||
  (a !== undefined && b !== undefined && a.length === b.length && a.every((n, i) => n === b[i]));

/**
 * The shown path written onto the elements: every edge's `sequence` and
 * `onPath`, every node's `onPath` (an end of a path edge), or all three
 * stripped when no path is shown. Same element back when nothing changed, so
 * a repaint on every edit costs no re-render.
 */
export function paintFocus(
  nodes: SdNode[],
  edges: SdEdge[],
  path: readonly string[] | null,
): { nodes: SdNode[]; edges: SdEdge[] } {
  const ordinals = path === null ? null : pathOrdinals(path);
  const onPathNodes = new Set<string>();
  if (ordinals !== null) {
    for (const edge of edges) {
      if (!ordinals.has(edge.id)) continue;
      onPathNodes.add(edge.source);
      onPathNodes.add(edge.target);
    }
  }
  const paintedEdges = edges.map((edge) => {
    const sequence = ordinals?.get(edge.id);
    const onPath = ordinals === null ? undefined : sequence !== undefined;
    if (sameSequence(edge.data?.sequence, sequence) && edge.data?.onPath === onPath) return edge;
    const { sequence: _s, onPath: _p, ...rest } = edge.data ?? { kind: 'sync' as const };
    return {
      ...edge,
      data: {
        ...rest,
        ...(sequence !== undefined ? { sequence } : {}),
        ...(onPath !== undefined ? { onPath } : {}),
      },
    } as SdEdge;
  });
  const paintedNodes = nodes.map((node) => {
    const onPath = ordinals === null ? undefined : onPathNodes.has(node.id);
    if (node.data.onPath === onPath) return node;
    const { onPath: _p, ...rest } = node.data;
    return { ...node, data: { ...rest, ...(onPath !== undefined ? { onPath } : {}) } } as SdNode;
  });
  return { nodes: paintedNodes, edges: paintedEdges };
}

/**
 * The paint every repaint site applies: the focused binding's path on the
 * elements, and no focus at all once that binding has no path to show.
 */
export function focusPainted(state: {
  nodes: SdNode[];
  edges: SdEdge[];
  bindings: readonly { criterionId: string; path?: string[] }[];
  focus: { criterionId: string } | null;
}): { nodes: SdNode[]; edges: SdEdge[]; focus: { criterionId: string } | null } {
  const path =
    state.focus === null
      ? null
      : (state.bindings.find((binding) => binding.criterionId === state.focus?.criterionId)?.path ??
        null);
  const shown = path !== null && path.length > 0 ? path : null;
  return {
    ...paintFocus(state.nodes, state.edges, shown),
    focus: shown === null ? null : state.focus,
  };
}

export const unselected = <T extends SdNode | SdEdge>(element: T): T =>
  element.selected ? { ...element, selected: false } : element;

/**
 * The elements with exactly `id` flagged selected — what `selectedId` looks
 * like on the canvas. The same array when the flags already say so.
 */
export function marked<T extends SdNode | SdEdge>(elements: T[], id: string | null): T[] {
  const stale = (element: T): boolean => (element.selected ?? false) !== (element.id === id);
  if (!elements.some(stale)) return elements;
  return elements.map((element) =>
    stale(element) ? ({ ...element, selected: element.id === id } as T) : element,
  );
}

/**
 * `selectedId` after React Flow reported `changes`: the element it just
 * selected; or, when the one the panel shows was deselected or removed,
 * whatever is still selected (`remaining`, the elements after the changes),
 * else nothing.
 */
export function selectionAfter(
  changes: readonly (NodeChange<SdNode> | EdgeChange<SdEdge>)[],
  selectedId: string | null,
  remaining: readonly (SdNode | SdEdge)[],
): string | null {
  let next = selectedId;
  for (const change of changes) {
    if (change.type === 'select' && change.selected) next = change.id;
    else if ((change.type === 'select' || change.type === 'remove') && change.id === next) {
      next = null;
    }
  }
  if (next !== null || next === selectedId) return next;
  return remaining.find((element) => element.selected)?.id ?? null;
}
