'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { useServerInsertedHTML } from 'next/navigation';
import { useState, type ReactNode } from 'react';

export interface EmotionRegistryProps {
  children?: ReactNode;
}

/**
 * The canonical App Router Emotion registry: one cache per request (the
 * `useState` initializer runs once per render tree, so a streamed request
 * never shares a cache with another), and `useServerInsertedHTML` flushes
 * everything inserted so far into the streamed HTML ahead of hydration.
 *
 * Upgrade path: this flushes the *entire* inserted registry on every server
 * insertion pass. For long streams with Suspense boundaries, the refinement
 * is to track which keys have already been flushed and emit only the delta
 * per pass (the `flushedKeys` pattern from the Next.js styling docs). At this
 * app's page sizes the simple form is correct and cheaper to reason about.
 */
export function EmotionRegistry({ children }: EmotionRegistryProps) {
  const [cache] = useState(() => {
    const created = createCache({ key: 'sds' });
    created.compat = true;
    return created;
  });

  useServerInsertedHTML(() => {
    const inserted = Object.entries(cache.inserted).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    if (inserted.length === 0) return null;
    return (
      <style
        data-emotion={`${cache.key} ${inserted.map(([name]) => name).join(' ')}`}
        // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml -- Emotion-serialized CSS, not user content; this is the registry's whole job
        dangerouslySetInnerHTML={{ __html: inserted.map(([, css]) => css).join(' ') }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
