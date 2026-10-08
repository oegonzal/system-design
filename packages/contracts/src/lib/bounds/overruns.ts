import type { BoundKind, DeclaredBound } from './bound';
import {
  isRecord,
  locationPath,
  type BoundPath,
  type LocationPath,
  type PathKey,
} from './json-paths';

/**
 * How a field past its target was handled: `accepted` within the ceiling,
 * `kept-over-ceiling` whole past it, `cut` at a word boundary past
 * `CUT_FACTOR` targets, `trimmed` to the ceiling by whole items.
 */
export type OverrunHandling = 'accepted' | 'kept-over-ceiling' | 'cut' | 'trimmed';

export interface Overrun {
  path: LocationPath;
  at: PathKey[];
  kind: BoundKind;
  target: number;
  ceiling: number;
  /** As written: characters, or items. */
  actual: number;
  handling: OverrunHandling;
  /** Items a trimmed list lost. */
  dropped?: number;
}

/** A bound path as segments: a key, `[]` for every item, `*` for every record value. */
const segmentsOf = (path: BoundPath): string[] =>
  path === '' ? [] : path.split('.').flatMap((part) => part.split(/(?=\[\])/));

/** Every value of `value` a bound path addresses, with where it sits. */
function* resolve(
  value: unknown,
  segments: readonly string[],
  at: PathKey[] = [],
): Generator<{ at: PathKey[]; found: unknown }> {
  if (segments.length === 0) {
    yield { at, found: value };
    return;
  }
  const [head, ...rest] = segments;
  if (head === '[]') {
    if (!Array.isArray(value)) return;
    for (let index = 0; index < value.length; index++) {
      yield* resolve(value[index], rest, [...at, index]);
    }
  } else if (head === '*') {
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) yield* resolve(child, rest, [...at, key]);
  } else if (isRecord(value) && head in value) {
    yield* resolve(value[head], rest, [...at, head]);
  }
}

/** Characters of a string or items of a list; null for a value the bound does not measure. */
function sizeOf(found: unknown, kind: BoundKind): number | null {
  if (kind === 'list') return Array.isArray(found) ? found.length : null;
  return typeof found === 'string' ? found.length : null;
}

/** Every field of a value past its target — on a value the schema accepted, all within the ceiling. */
export function overrunsOf(
  value: unknown,
  bounds: Readonly<Record<BoundPath, DeclaredBound>>,
): Overrun[] {
  const overruns: Overrun[] = [];
  for (const [path, declared] of Object.entries(bounds)) {
    for (const { at, found } of resolve(value, segmentsOf(path))) {
      const actual = sizeOf(found, declared.kind);
      if (actual === null || actual <= declared.target) continue;
      overruns.push({
        path: locationPath(at),
        at,
        kind: declared.kind,
        target: declared.target,
        ceiling: declared.ceiling,
        actual,
        handling: actual <= declared.ceiling ? 'accepted' : 'kept-over-ceiling',
      });
    }
  }
  return overruns;
}
