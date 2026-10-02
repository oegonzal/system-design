/**
 * How a raw finding is joined to what became of it.
 *
 * The wire carries no edge between what a critic sample said and the confirmed
 * or discarded entry it ended up in — the normaliser groups raw findings and
 * publishes the group, not its provenance. So the edge is derived here, and
 * every view that shows one says it is derived.
 *
 * The derivation restates two things the engine declares, and nothing more:
 *
 * - **The key format.** `ConfirmedFinding.key` and `DiscardedItem.key` are
 *   documented in the contract as `${type}|${sorted locationRefs}`, which is
 *   what lets a key be read back into the two facts it encodes.
 * - **The identity rule.** Two findings describe one defect when they share a
 *   type and point at a common location, or when neither points anywhere. That
 *   is deliberately weaker than equal keys: two samples describing one defect
 *   routinely cite overlapping but different evidence.
 *
 * Why the join is then unambiguous: the engine merges every touching group, so
 * two distinct groups of one type never share a location. A raw finding
 * therefore overlaps exactly one group — or none, which is reported as such
 * rather than guessed at.
 */

export interface DefectShape {
  readonly type: string;
  readonly locationRefs: readonly string[];
}

/** The engine's own structural key, restated: type, then its locations deduped and sorted. */
export const findingKey = (type: string, locationRefs: readonly string[]): string =>
  `${type}|${[...new Set(locationRefs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(',')}`;

/** A published key read back into the two facts it encodes. */
export function parseFindingKey(key: string): DefectShape {
  const split = key.indexOf('|');
  if (split === -1) return { type: key, locationRefs: [] };
  const refs = key.slice(split + 1);
  return {
    type: key.slice(0, split),
    locationRefs: refs === '' ? [] : refs.split(','),
  };
}

/**
 * Whether two findings describe one defect: the same type, pointing at a common
 * location — or neither pointing anywhere.
 */
export const sameDefect = (a: DefectShape, b: DefectShape): boolean =>
  a.type === b.type &&
  (a.locationRefs.length === 0 || b.locationRefs.length === 0
    ? a.locationRefs.length === b.locationRefs.length
    : a.locationRefs.some((ref) => b.locationRefs.includes(ref)));

/**
 * The published key a raw finding belongs to: an exact key first (which is how
 * an inadmissible finding is recorded), then the one group it overlaps.
 */
export function groupKeyFor(raw: DefectShape, keys: readonly string[]): string | null {
  const exact = findingKey(raw.type, raw.locationRefs);
  if (keys.includes(exact)) return exact;
  return keys.find((key) => sameDefect(raw, parseFindingKey(key))) ?? null;
}
