import { MOMENT_ATTRIBUTES, nodesOnly, type PageObservation } from './observation.schema';

/** A moment attribute as a snapshot line carries it, with the space before it: `[ref=e12]`, `[active]`. */
const MOMENT_TOKEN = new RegExp(` \\[(?:${MOMENT_ATTRIBUTES.join('|')})(?:=[^\\]]*)?\\]`, 'g');

/**
 * The identity of what an observation showed, as the session compares one
 * page with the last: the URL and title, the open scope, every listed
 * element's structural facts in order, what was left unlisted and what would
 * not read, and the snapshot's text. Two reads of one unchanged page fingerprint equal; a page
 * that changed in any fact the goal renders fingerprints differently.
 *
 * The ref tokens and the focus mark are left OUT. A ref is minted per snapshot by the adapter
 * and may differ between two reads of an identical page; a fingerprint that
 * changed on a re-minted ref would call a stalled page "moved", which is the
 * one direction a stall rail may not be wrong in. So is the inline text of
 * the snapshot's nodes: of the snapshot, the structure — every node's role,
 * name and attributes — is the identity, and a paragraph that counts seconds
 * or notifications is not a page that moved. The elements are identity in
 * every fact the goal renders of them, their values and the words of an
 * unnamed one included. What the read itself cost (`reading`) is a fact
 * about the reader and is left out too. Nothing here hashes: the canonical
 * text is the identity, compared and never stored beyond the previous
 * step's, so an isomorphic contract needs no crypto.
 */
export function observationFingerprint(observation: PageObservation): string {
  return JSON.stringify({
    url: observation.url,
    title: observation.title,
    activeScope: observation.activeScope,
    elements: observation.elements.map((element) => [
      element.role,
      element.name,
      element.text,
      element.scope,
      element.kind,
      element.inputType,
      element.value,
      element.options,
      element.optionsOmitted,
      element.required,
      element.invalid,
      element.disabled,
      element.visible,
      element.hiddenTraits,
      element.context,
      element.landmark,
    ]),
    omittedElements: observation.omittedElements,
    unread: observation.unread,
    // A moment attribute goes with the space before it: a token left behind as
    // a double space fails the node-line grammar, and the line leaves the
    // identity. Measured 2026-10-07: 117 of 1006 lines — every one carrying
    // another attribute, `[cursor=pointer]` or `[active]` — were silently dropped.
    snapshot: nodesOnly(observation.ariaSnapshot.replace(MOMENT_TOKEN, '')),
  });
}
