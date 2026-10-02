import type { Delta } from './differ';
import { identityOf } from './object-hash';

/**
 * A delta decoded into a flat list of path-addressed changes.
 *
 * This is the one place that knows how jsondiffpatch encodes a delta, and the
 * division of labour around it is deliberate. **The delta is the authority on
 * what changed** — it is produced by one library with one configuration and
 * decoded here exactly once. **The pair of states is the authority on context**,
 * which is what lets a tree view show the unchanged siblings a delta
 * structurally cannot mention. Neither is asked to do the other's job.
 *
 * Paths are printed by domain identity rather than by array index, because an
 * index is not a name: `ledger.criteria[criterion:c2].result` still points at
 * the same criterion after a list is reordered, where `ledger.criteria[1]`
 * does not.
 */

export const CHANGE_KINDS = ['added', 'removed', 'updated', 'moved'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export interface PathSegment {
  label: string;
  kind: 'property' | 'element';
}

export interface JsonChange {
  /** The printed path — `ledger.criteria[criterion:c2].result`. */
  path: string;
  segments: PathSegment[];
  kind: ChangeKind;
  /** Absent for an addition. */
  before?: unknown;
  /** Absent for a removal. */
  after?: unknown;
  /** For a move within an array. */
  fromIndex?: number;
  toIndex?: number;
  /** True when the subtree was reported whole because the depth bound was reached. */
  whole: boolean;
}

/**
 * How deep a change is addressed before the subtree is reported whole. Twelve
 * is past the deepest path any contract shape reaches, so the bound exists to
 * stop an unknown artifact shape from producing an unreadable list — not to
 * truncate the loop's own data.
 */
export const MAX_DEPTH = 12;

/** `a.b[c].d`, with properties joined by dots and elements bracketed. */
export const printPath = (segments: readonly PathSegment[]): string =>
  segments.reduce(
    (path, segment) =>
      segment.kind === 'element'
        ? `${path}[${segment.label}]`
        : path === ''
          ? segment.label
          : `${path}.${segment.label}`,
    '',
  );

// ---- the encoding, named once -------------------------------------------------

const isArrayNode = (delta: Delta): boolean =>
  delta !== undefined && typeof delta === 'object' && !Array.isArray(delta) && '_t' in delta;

const isObjectNode = (delta: Delta): boolean =>
  delta !== undefined && typeof delta === 'object' && !Array.isArray(delta) && !('_t' in delta);

const at = (value: unknown, key: string | number): unknown =>
  value === null || typeof value !== 'object'
    ? undefined
    : (value as Record<string | number, unknown>)[key];

/** An element's name in a path: its identity, or its index. */
const elementLabel = (element: unknown, index: number): string =>
  identityOf(element, index) ?? String(index);

const element = (element: unknown, index: number): PathSegment => ({
  label: elementLabel(element, index),
  kind: 'element',
});

const property = (name: string): PathSegment => ({ label: name, kind: 'property' });

// ---- the walk ---------------------------------------------------------------

/** A leaf delta — one of the four array encodings — as a change, or nothing. */
function leafChange(
  delta: readonly unknown[],
  segments: PathSegment[],
  before: unknown,
  after: unknown,
): JsonChange | null {
  const path = printPath(segments);
  if (delta.length === 1) return { path, segments, kind: 'added', after: delta[0], whole: false };
  if (delta.length === 2) {
    return { path, segments, kind: 'updated', before: delta[0], after: delta[1], whole: false };
  }
  if (delta.length === 3 && delta[2] === 0) {
    return { path, segments, kind: 'removed', before: delta[0], whole: false };
  }
  if (delta.length === 3 && delta[2] === 3) {
    return {
      path,
      segments,
      kind: 'moved',
      toIndex: delta[1] as number,
      before,
      after,
      whole: false,
    };
  }
  // A text diff: never produced by this app's differ, since none is configured.
  // Reported as a whole-value change rather than decoded into a patch encoding.
  if (delta.length === 3 && delta[2] === 2) {
    return { path, segments, kind: 'updated', before, after, whole: true };
  }
  /* c8 ignore next -- the four encodings above are the whole vocabulary */
  return null;
}

function walk(
  delta: Delta,
  segments: PathSegment[],
  before: unknown,
  after: unknown,
  depth: number,
  out: JsonChange[],
): void {
  if (delta === undefined) return;

  if (Array.isArray(delta)) {
    const change = leafChange(delta, segments, before, after);
    if (change !== null) out.push(change);
    return;
  }

  if (depth >= MAX_DEPTH) {
    out.push({
      path: printPath(segments),
      segments,
      kind: 'updated',
      before,
      after,
      whole: true,
    });
    return;
  }

  if (isArrayNode(delta)) {
    const node = delta as Record<string, Delta>;
    for (const [key, child] of Object.entries(node)) {
      if (key === '_t') continue;
      if (key.startsWith('_')) {
        // An old index: the element was removed, or moved elsewhere.
        const index = Number(key.slice(1));
        const value = at(before, index);
        const moved = Array.isArray(child) && child.length === 3 && child[2] === 3;
        const change = leafChange(
          child as readonly unknown[],
          [...segments, element(value, index)],
          value,
          moved ? at(after, (child as readonly unknown[])[1] as number) : undefined,
        );
        if (change !== null) out.push({ ...change, fromIndex: index });
        continue;
      }
      const index = Number(key);
      const next = at(after, index);
      walk(child, [...segments, element(next, index)], at(before, index), next, depth + 1, out);
    }
    return;
  }

  if (isObjectNode(delta)) {
    for (const [name, child] of Object.entries(delta as Record<string, Delta>)) {
      walk(child, [...segments, property(name)], at(before, name), at(after, name), depth + 1, out);
    }
  }
}

/**
 * Every change the delta encodes, in the order the delta names them, each
 * addressed by a path printed from domain identity.
 */
export function changesOf(delta: Delta, before: unknown, after: unknown): JsonChange[] {
  const out: JsonChange[] = [];
  walk(delta, [], before, after, 0, out);
  return out;
}

/** How many changes of each kind — the summary a timeline row shows. */
export function countKinds(changes: readonly JsonChange[]): Record<ChangeKind, number> {
  const counts: Record<ChangeKind, number> = { added: 0, removed: 0, updated: 0, moved: 0 };
  for (const change of changes) counts[change.kind] += 1;
  return counts;
}
