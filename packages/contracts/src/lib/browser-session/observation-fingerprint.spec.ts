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
    // The words on an unnamed element, the dialog an element sits in, and the
    // dialog in front are each a fact the goal shows — so each is identity: a
    // dialog opening over an unchanged page is a page that changed.
    const worded = {
      ...first,
      elements: first.elements.map((element, index) =>
        index === 2 ? { ...element, name: '', text: 'Senior Engineer — Acme' } : element,
      ),
    };
    const scoped = {
      ...first,
      elements: first.elements.map((element, index) =>
        index === 2
          ? { ...element, scope: { role: 'dialog' as const, name: 'Apply', modal: true } }
          : element,
      ),
    };
    const dialogInFront = { ...first, activeScope: { role: 'dialog' as const, name: 'Apply' } };
    // A field the page marks invalid, and a select the page offers more of, are facts the goal shows.
    const invalidNow = {
      ...first,
      elements: first.elements.map((element, index) =>
        index === 0 ? { ...element, invalid: true } : element,
      ),
    };
    const moreOptions = {
      ...first,
      elements: first.elements.map((element, index) =>
        index === 0 ? { ...element, optionsOmitted: 5 } : element,
      ),
    };
    // The landmark an element sits in is a fact the goal renders: identity too.
    const relocated = {
      ...first,
      elements: first.elements.map((element, index) =>
        index === 2 ? { ...element, landmark: 'main' as const } : element,
      ),
    };
    for (const changed of [
      retitled,
      oneFewer,
      disabledNow,
      unread,
      worded,
      scoped,
      dialogInFront,
      invalidNow,
      moreOptions,
      relocated,
    ]) {
      expect(observationFingerprint(changed)).not.toBe(observationFingerprint(first));
    }

    // The words inside a node are not identity: a paragraph that counts seconds
    // or notifications is not a page that moved, and a snapshot reduced to its
    // note line says nothing about the page. A node appearing or going is.
    const counting = {
      ...first,
      ariaSnapshot: `${first.ariaSnapshot}\n- paragraph [ref=e9]: 3 minutes ago`,
    };
    const countingOn = {
      ...first,
      ariaSnapshot: `${first.ariaSnapshot}\n- paragraph [ref=e9]: 4 minutes ago\n- text: live`,
    };
    expect(observationFingerprint(counting)).toBe(observationFingerprint(countingOn));
    expect(observationFingerprint(counting)).not.toBe(observationFingerprint(first));
    const noted = {
      ...first,
      ariaSnapshot: '[snapshot reduced to none: 1418 of 1418 lines not shown]',
      snapshotRung: 'none' as const,
    };
    const notedAgain = {
      ...noted,
      ariaSnapshot: '[snapshot reduced to none: 1419 of 1419 lines not shown]',
    };
    expect(observationFingerprint(noted)).toBe(observationFingerprint(notedAgain));
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

  it('[BRW-4] keeps every snapshot node in the identity, the ones carrying another attribute after the ref included', () => {
    // Measured 2026-10-07: stripping `[ref=…]` left a double space before
    // `[cursor=pointer]`, the node-line grammar refused the line, and 117 of
    // 1006 lines — every clickable node — left the identity unseen.
    const first = listingObservation();
    const clickable = {
      ...first,
      ariaSnapshot: `${first.ariaSnapshot}\n  - button "Next page" [ref=e9] [cursor=pointer]`,
    };
    const renamed = {
      ...clickable,
      ariaSnapshot: clickable.ariaSnapshot.replace('Next page', 'Last page'),
    };
    expect(observationFingerprint(clickable)).not.toBe(observationFingerprint(first));
    expect(observationFingerprint(renamed)).not.toBe(observationFingerprint(clickable));
    // Where focus sits is a fact about the moment, not the page: a click that
    // moved only the `[active]` mark left the page as it was. Measured
    // 2026-10-08: two re-clicks of an already-selected card differed from the
    // step before in nothing else.
    const focused = {
      ...clickable,
      ariaSnapshot: clickable.ariaSnapshot.replace('[cursor=pointer]', '[active] [cursor=pointer]'),
    };
    expect(observationFingerprint(focused)).toBe(observationFingerprint(clickable));
    // A line YAML wrapped in single quotes is a node like any other, and in the identity.
    const wrapped = {
      ...first,
      ariaSnapshot: `${first.ariaSnapshot}\n  - 'combobox "Note: required" [ref=e9] [cursor=pointer]':`,
    };
    const rewrapped = {
      ...wrapped,
      ariaSnapshot: wrapped.ariaSnapshot.replace('Note: required', 'Note: optional'),
    };
    expect(observationFingerprint(wrapped)).not.toBe(observationFingerprint(first));
    expect(observationFingerprint(rewrapped)).not.toBe(observationFingerprint(wrapped));
  });
});
