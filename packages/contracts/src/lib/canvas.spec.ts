import { describe, expect, it } from 'vitest';

import { NODE_KINDS, NODE_KIND_CATEGORIES, NODE_KIND_CATEGORY, kindsInCategory } from './canvas';

/**
 * The category tables' structural invariants. `satisfies` already proves both
 * directions at compile time; these assertions guard the runtime shape against
 * a cast slipped past the type layer — and, now that the full catalog has
 * landed, pin every declared category to at least one member, so a shelf
 * cannot quietly empty out in a refactor.
 */
describe('node-kind categories', () => {
  it('files every kind under a declared category id', () => {
    const declared = new Set<string>(NODE_KIND_CATEGORIES.map((category) => category.id));
    for (const kind of NODE_KINDS) {
      expect(declared.has(NODE_KIND_CATEGORY[kind]), `${kind} is filed under an unknown id`).toBe(
        true,
      );
    }
  });

  it('partitions the kind vocabulary: all categories together are exactly NODE_KINDS', () => {
    const shelved = NODE_KIND_CATEGORIES.flatMap((category) => kindsInCategory(category.id));
    // Same set…
    expect([...shelved].sort()).toEqual([...NODE_KINDS].sort());
    // …and same count, so no kind sits on two shelves.
    expect(shelved).toHaveLength(NODE_KINDS.length);
  });

  it('keeps category ids unique', () => {
    const ids = NODE_KIND_CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves no category empty now the full catalog has landed', () => {
    for (const category of NODE_KIND_CATEGORIES) {
      expect(kindsInCategory(category.id).length, `${category.id} holds no kinds`).toBeGreaterThan(
        0,
      );
    }
  });
});
