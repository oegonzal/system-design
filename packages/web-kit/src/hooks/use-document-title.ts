'use client';

import { useEffect } from 'react';

/**
 * Names the tab after what a page shows once it knows — a prompt's own
 * title rather than the route's generic one. Null leaves the route's title
 * standing. Nothing is restored on unmount: the next route's metadata
 * titles the document itself.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title !== null) document.title = title;
  }, [title]);
}
