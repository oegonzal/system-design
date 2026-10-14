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
