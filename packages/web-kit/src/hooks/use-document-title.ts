'use client';

import { useEffect } from 'react';

/**
 * Names the tab after what a page shows once it knows — a prompt's own
 * title rather than the route's generic one — and keeps it named for as
 * long as the page holds that title. Null holds nothing: the route's title
 * stands.
 *
 * Writing the title once is a race the page loses whenever its data arrives
 * before the route's metadata does: the router commits its `<title>` after
 * the write, and the tab reads the generic name for good. So a held title
 * is watched — whatever else titles the document meanwhile is noted as the
 * route's own and written over — and on release the route's latest title is
 * put back, unless the next route has already written its own.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => (title === null ? undefined : holdDocumentTitle(title)), [title]);
}

/** One page's claim on the document title. */
interface TitleHold {
  readonly title: string;
}

/**
 * Every live hold, oldest first; the newest names the document. One list
 * and one observer per document, so two holders never write over each other
 * in turns.
 */
const holds: TitleHold[] = [];
let observer: MutationObserver | null = null;
/** What the route titled the document: the last title anyone but a hold wrote. */
let routeTitle = '';
/**
 * The hold whose title the document carries, and how the document reads
 * that title back — it strips and collapses whitespace, so "still ours" is
 * compared against the reading, never against the held string.
 */
let written: { hold: TitleHold; readsAs: string } | null = null;

/** Notes a title someone else wrote as the route's, then writes the newest hold over it. */
function assertHeldTitle(): void {
  const hold = holds.at(-1);
  if (hold === undefined) return;
  const current = document.title;
  if (written === null || current !== written.readsAs) routeTitle = current;
  else if (written.hold === hold) return;
  document.title = hold.title;
  written = { hold, readsAs: document.title };
}

function holdDocumentTitle(title: string): () => void {
  const hold: TitleHold = { title };
  if (observer === null) {
    // The whole document, not only its head: a title streamed in late lands in the body.
    observer = new MutationObserver(assertHeldTitle);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }
  holds.push(hold);
  assertHeldTitle();

  return () => {
    holds.splice(holds.indexOf(hold), 1);
    if (holds.length > 0) {
      assertHeldTitle();
      return;
    }
    observer?.disconnect();
    observer = null;
    // A title written since the last look is the next route's own, and it stands.
    if (document.title === written?.readsAs) document.title = routeTitle;
    written = null;
  };
}
