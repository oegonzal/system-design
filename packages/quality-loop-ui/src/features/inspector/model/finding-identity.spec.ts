import { describe, expect, it } from 'vitest';

import { findingKey, groupKeyFor, parseFindingKey, sameDefect } from './finding-identity';

describe('joining a raw finding to what became of it', () => {
  it('[QLU-9] reads a published key back into the two facts it encodes', () => {
    expect(parseFindingKey('gap|a,b')).toEqual({ type: 'gap', locationRefs: ['a', 'b'] });
    expect(parseFindingKey('gap|')).toEqual({ type: 'gap', locationRefs: [] });
    // A type with no bar at all: no refs rather than a parse failure.
    expect(parseFindingKey('gap')).toEqual({ type: 'gap', locationRefs: [] });
    expect(findingKey('gap', ['b', 'a', 'b'])).toBe('gap|a,b');
  });

  it('[QLU-9] one defect means the same type and a shared location, not the same set', () => {
    // Identity by equal key made agreement almost unreachable: two samples
    // describing one defect routinely cite overlapping but different evidence.
    expect(
      sameDefect(
        { type: 'gap', locationRefs: ['a', 'b'] },
        { type: 'gap', locationRefs: ['b', 'c'] },
      ),
    ).toBe(true);
    expect(
      sameDefect({ type: 'gap', locationRefs: ['a'] }, { type: 'gap', locationRefs: ['c'] }),
    ).toBe(false);
    expect(
      sameDefect({ type: 'gap', locationRefs: ['a'] }, { type: 'other', locationRefs: ['a'] }),
    ).toBe(false);
    // Pointing nowhere is its own identity: both or neither.
    expect(sameDefect({ type: 'gap', locationRefs: [] }, { type: 'gap', locationRefs: [] })).toBe(
      true,
    );
    expect(
      sameDefect({ type: 'gap', locationRefs: [] }, { type: 'gap', locationRefs: ['a'] }),
    ).toBe(false);
  });

  it('[QLU-9] a sample’s finding joins the merged group it overlaps, not one that merely shares a type', () => {
    // The group's key carries the union of its members' locations, which is why
    // a member's own key is usually not the group's.
    const keys = [
      'unhandled_failure|edge.4,node.3,node.4,rationale.4',
      'unhandled_failure|edge.10,node.10',
      'contradiction|node.3',
    ];
    expect(
      groupKeyFor({ type: 'unhandled_failure', locationRefs: ['node.3', 'node.7'] }, keys),
    ).toBe('unhandled_failure|edge.4,node.3,node.4,rationale.4');
    expect(groupKeyFor({ type: 'unhandled_failure', locationRefs: ['node.10'] }, keys)).toBe(
      'unhandled_failure|edge.10,node.10',
    );
    // Nothing overlaps: reported as unjoined rather than attached to a guess.
    expect(groupKeyFor({ type: 'unhandled_failure', locationRefs: ['node.99'] }, keys)).toBeNull();
  });

  it('[QLU-9] an exact key wins, which is how an inadmissible finding is recorded', () => {
    // An inadmissible finding is keyed on its own unfiltered refs, so the exact
    // key has to be preferred over any group it would otherwise overlap.
    const keys = ['weird_type|a,b', 'weird_type|b,c'];
    expect(groupKeyFor({ type: 'weird_type', locationRefs: ['b', 'c'] }, keys)).toBe(
      'weird_type|b,c',
    );
  });
});
