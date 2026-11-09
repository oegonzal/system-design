/**
 * The two list algebras a change set is applied by, generic over the item.
 * A KEYED list — nodes, edges, entities, bindings, rationales, narrations —
 * is edited by whole items addressed by their key; an INDEXED list —
 * decisions, assumptions — by the 1-based position the artifact showed,
 * since its items have no key of their own. Both are pure and total: an
 * address naming nothing is a no-op, never a fault.
 */

/** What a keyed list is changed by: items to add or rewrite, and keys to remove. */
interface KeyedChanges<Item> {
  upsert: readonly Item[];
  remove: readonly string[];
}

/**
 * A keyed list after its changes: a known key replaces its item IN PLACE, so
 * the positional ids of untouched elements keep their numbers and last
 * round's citations still land; a new key is appended; a later upsert for
 * one key wins; then the removals, a key naming nothing a no-op. `asExisting`
 * says which existing item an unknown-keyed one stands for — an edge that
 * repeats a hop already drawn — by returning it under that item's key; it is
 * asked only when the key is unknown, and by default nothing stands for
 * anything.
 */
export function appliedKeyed<Item>(
  items: readonly Item[],
  changes: KeyedChanges<Item> | undefined,
  keyOf: (item: Item) => string,
  asExisting: (item: Item, existing: readonly Item[]) => Item = (item) => item,
): Item[] {
  const next = [...items];
  if (changes === undefined) return next;
  const indexByKey = new Map(next.map((item, index) => [keyOf(item), index]));
  for (const upserted of changes.upsert) {
    const item = indexByKey.has(keyOf(upserted)) ? upserted : asExisting(upserted, next);
    const key = keyOf(item);
    const index = indexByKey.get(key);
    if (index === undefined) indexByKey.set(key, next.push(item) - 1);
    else next[index] = item;
  }
  const removed = new Set(changes.remove);
  return next.filter((item) => !removed.has(keyOf(item)));
}

/** What an indexed list is changed by: items rewritten at a position of the base list, positions removed, and items appended. */
interface IndexedChanges<Item> {
  upsertAt: readonly { at: number; item: Item }[];
  removeAt: readonly number[];
  append: readonly Item[];
}

/**
 * An indexed list after its changes. Every position is the base list's,
 * 1-based, as the artifact numbered it: an upsert rewrites in place, a later
 * one for the same position winning; the removals are read against those
 * same positions — as a set, so no removal shifts the ones after it — and
 * the appended items follow. A position the list does not have is ignored.
 */
export function appliedIndexed<Item>(
  items: readonly Item[],
  { upsertAt, removeAt, append }: IndexedChanges<Item>,
): Item[] {
  const next = [...items];
  for (const { at, item } of upsertAt) {
    if (Number.isInteger(at) && at >= 1 && at <= next.length) next[at - 1] = item;
  }
  const removed = new Set(removeAt);
  return [...next.filter((_, index) => !removed.has(index + 1)), ...append];
}
