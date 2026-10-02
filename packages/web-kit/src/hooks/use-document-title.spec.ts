import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDocumentTitle } from './use-document-title';

/** The router committing a route's `<title>`: it rewrites the element's text, as React does. */
function routeTitles(title: string): void {
  const element = document.querySelector('title');
  if (element === null) throw new Error('the document has no <title> to commit to');
  element.textContent = title;
}

/** Lets the document's pending mutations reach whoever watches them. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const hold = (title: string | null) =>
  renderHook(({ held }) => useDocumentTitle(held), { initialProps: { held: title } });

describe('useDocumentTitle', () => {
  it('names the document once the title is known, and leaves it standing while it is not', () => {
    document.title = 'Prompt · App';
    const page = hold(null);
    expect(document.title).toBe('Prompt · App');

    page.rerender({ held: 'Order history · App' });
    expect(document.title).toBe('Order history · App');
    page.unmount();
  });

  it('keeps the document named when the route’s own title is committed after it', async () => {
    document.title = '';
    const page = hold('Order history · App');

    // The race a direct load loses: the data answered first, the metadata settles second.
    routeTitles('Prompt · App');
    await waitFor(() => expect(document.title).toBe('Order history · App'));

    // A second <title>, inserted ahead of the first, is written over just the same.
    document.head.prepend(Object.assign(document.createElement('title'), { text: 'Prompt · App' }));
    await waitFor(() => expect(document.title).toBe('Order history · App'));
    page.unmount();
    document.head.querySelector('title')?.remove();
  });

  it('gives the route its latest title back on release', async () => {
    document.title = 'Prompt · App';
    const page = hold('Order history · App');
    routeTitles('STAR story · App');
    await waitFor(() => expect(document.title).toBe('Order history · App'));

    page.rerender({ held: null });
    expect(document.title).toBe('STAR story · App');
    page.unmount();
  });

  it('leaves a title the next route wrote just before the release', () => {
    document.title = 'Prompt · App';
    const page = hold('Order history · App');

    // Committed in the same turn as the unmount: nothing has been told of it yet.
    routeTitles('Prompts · App');
    page.unmount();
    expect(document.title).toBe('Prompts · App');
  });

  it('holds a title the document reads back differently without writing it for ever', async () => {
    document.title = 'Prompt · App';
    const page = hold('  Order   history · App ');
    expect(document.title).toBe('Order history · App');

    let writes = 0;
    const counter = new MutationObserver((records) => {
      writes += records.length;
    });
    counter.observe(document.head, { subtree: true, childList: true, characterData: true });
    routeTitles('Prompt · App');
    await settle();
    await settle();
    counter.disconnect();

    expect(document.title).toBe('Order history · App');
    // The route's commit and the one write over it — not a loop of rewrites.
    expect(writes).toBeLessThanOrEqual(4);
    page.unmount();
  });

  it('lets the newest of two holders name the document, and falls back to the older one', async () => {
    document.title = 'Practice · App';
    const older = hold('Checkout design · App');
    const newer = hold('Order history · App');
    expect(document.title).toBe('Order history · App');

    await settle();
    expect(document.title).toBe('Order history · App');

    newer.unmount();
    expect(document.title).toBe('Checkout design · App');
    older.unmount();
    expect(document.title).toBe('Practice · App');
  });
});
