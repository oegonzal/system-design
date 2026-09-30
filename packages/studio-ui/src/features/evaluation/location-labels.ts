import type { EvaluationLocationDto } from '@sysdesign/contracts';

/** A literal made safe to sit inside a `RegExp` source. */
export const escapeRegExp = (literal: string): string =>
  literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A lens's prose with every location id it cites — `node.3`, `binding.1` —
 * replaced by the label the mapper grounded it to, so the author reads
 * "Orders DB" where the model wrote a position. Pure. Longest id first and
 * a word-boundary lookahead, so a listed `node.1` never eats the `node.12`
 * beside it; an id the mapper could not place is left as written.
 */
export function substituteLocationLabels(
  prose: string,
  locations: readonly EvaluationLocationDto[],
): string {
  if (locations.length === 0) return prose;
  const labelOf = new Map(locations.map((location) => [location.ref, location.label]));
  const refs = [...labelOf.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(?:${refs.map(escapeRegExp).join('|')})(?!\\w)`, 'g');
  return prose.replace(pattern, (ref) => labelOf.get(ref) ?? ref);
}
