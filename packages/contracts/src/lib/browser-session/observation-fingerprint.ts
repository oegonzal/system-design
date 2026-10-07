import type { PageObservation } from './observation.schema';

/**
 * The identity of what an observation showed, as the session compares one
 * page with the last: the URL and title, every listed element's structural
 * facts in order, what was left unlisted and what would not read, and the
 * snapshot's text. Two reads of one unchanged page fingerprint equal; a page
 * that changed in any fact the goal renders fingerprints differently.
 *
 * The ref tokens are left OUT. A ref is minted per snapshot by the adapter
 * and may differ between two reads of an identical page; a fingerprint that
 * changed on a re-minted ref would call a stalled page "moved", which is the
 * one direction a stall rail may not be wrong in. Nothing here hashes: the
 * canonical text is the identity, compared and never stored beyond the
 * previous step's, so an isomorphic contract needs no crypto.
 */
export function observationFingerprint(observation: PageObservation): string {
  return JSON.stringify({
    url: observation.url,
    title: observation.title,
    elements: observation.elements.map((element) => [
      element.role,
      element.name,
      element.kind,
      element.inputType,
      element.value,
      element.options,
      element.required,
      element.disabled,
      element.visible,
      element.hiddenTraits,
      element.context,
    ]),
    omittedElements: observation.omittedElements,
    unread: observation.unread,
    snapshot: observation.ariaSnapshot.replace(/\[ref=[^\]]*\]/g, '').trim(),
  });
}
