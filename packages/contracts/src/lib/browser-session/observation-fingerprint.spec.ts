import { describe, expect, it } from 'vitest';

import { listingObservation } from './fixtures';
import { observationFingerprint } from './observation-fingerprint';

describe('observationFingerprint', () => {
  it('[BRW-4] is the same for two reads of one page however the refs were minted, and different for any fact the goal shows', () => {
    const first = listingObservation();
    // The adapter mints refs per snapshot: a second read of the same page may
    // number them differently, in the elements and in the snapshot text alike.
    const reminted = {
      ...first,
      elements: first.elements.map((element, index) => ({ ...element, ref: `f1e${index + 1}` })),
      ariaSnapshot: first.ariaSnapshot.replace(/\[ref=e(\d)\]/g, '[ref=f1e$1]'),
    };
    expect(observationFingerprint(reminted)).toBe(observationFingerprint(first));

    // Anything the goal renders about the page changes it.
    const retitled = { ...first, title: `${first.title} — page 2` };
    const oneFewer = { ...first, elements: first.elements.slice(1) };
    const disabledNow = {
      ...first,
      elements: first.elements.map((element, index) =>
        index === 1 ? { ...element, disabled: true } : element,
      ),
    };
    const unread = { ...first, unread: { elements: 3, snapshotLines: 0 } };
    for (const changed of [retitled, oneFewer, disabledNow, unread]) {
      expect(observationFingerprint(changed)).not.toBe(observationFingerprint(first));
    }
  });

  it('[BRW-4] reads an empty document as one identity, so a session that never leaves it is seen to be standing still', () => {
    const blank = {
      ...listingObservation(),
      url: 'about:blank',
      title: '',
      elements: [],
      ariaSnapshot: '',
    };
    expect(observationFingerprint(blank)).toBe(observationFingerprint({ ...blank }));
    expect(observationFingerprint(blank)).not.toBe(observationFingerprint(listingObservation()));
  });
});
