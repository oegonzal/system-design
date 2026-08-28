'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { useServerInsertedHTML } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

export interface EmotionRegistryProps {
  children?: ReactNode;
}

/**
 * The App Router Emotion registry: one cache per request (the `useState`
 * initializer runs once per render tree, so a streamed request never shares
 * a cache with another), and `useServerInsertedHTML` streams styles into the
 * HTML ahead of hydration.
 *
 * Two rules here are load-bearing, both learned from a real dark-mode bug:
 *
 * 1. **Emit each style once.** The naive form re-emits the entire inserted
 *    registry on every flush, so a page streams multiple copies of every
 *    rule. `flush()` tracks the names inserted since the previous pass and
 *    emits only the delta.
 * 2. **Stream under a key the client will not adopt, then remove.** The
 *    streamed copies are snapshots of the *server* render — always the
 *    default light theme — and they outlive hydration. Left in place they
 *    sit later in the head than the client's own tags, where class-keyed
 *    rules dodge them (a theme change mints new class names) but
 *    element-selector globals like `body { color }` tie on specificity and
 *    lose by source order: toggling dark mode flipped every class-styled
 *    surface while inherited text kept the light theme's ink. They cannot
 *    simply be deleted, either — Emotion's client cache *rehydrates* any
 *    `<style data-emotion="sds …">` it finds, adopting the tag as a live
 *    sheet and skipping re-insertion, so deleting an adopted tag strips the
 *    page. Streaming them as `sds-ssr` sidesteps adoption entirely: the
 *    client cache re-inserts every rule into sheets it owns during
 *    hydration, and the snapshots — by then inert duplicates — are removed
 *    in an effect.
 */
export function EmotionRegistry({ children }: EmotionRegistryProps) {
  const [{ cache, flush }] = useState(() => {
    const created = createCache({ key: 'sds' });
    created.compat = true;

    const previousInsert = created.insert.bind(created);
    let pending: string[] = [];
    created.insert = (selector, serialized, sheet, shouldCache) => {
      if (created.inserted[serialized.name] === undefined) {
        pending.push(serialized.name);
      }
      return previousInsert(selector, serialized, sheet, shouldCache);
    };

    return {
      cache: created,
      flush: () => {
        const names = pending;
        pending = [];
        return names;
      },
    };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) return null;

    let styles = '';
    for (const name of names) {
      const css = cache.inserted[name];
      if (typeof css === 'string') styles += css;
    }

    return (
      <style
        // `-ssr` keeps the key from matching the client cache — see rule 2.
        data-emotion={`${cache.key}-ssr ${names.join(' ')}`}
        // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml -- Emotion-serialized CSS, not user content; this is the registry's whole job
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  useEffect(() => {
    // Hydration is done and Emotion has inserted everything into its own
    // sheets — the streamed snapshots are now dead weight (see rule 2 above).
    document
      .querySelectorAll(`style[data-emotion^="${cache.key}-ssr"]`)
      .forEach((element) => element.remove());
  }, [cache.key]);

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
