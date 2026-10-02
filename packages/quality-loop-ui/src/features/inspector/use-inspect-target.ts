'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import {
  inspectHref,
  normaliseTarget,
  parseInspectTarget,
  sameTarget,
  type InspectTarget,
} from './model/inspect-link';

export interface InspectTargetState {
  /** What the URL says the inspector is pointed at. */
  target: InspectTarget;
  /** Point it somewhere else, merging into what is already selected. */
  point(next: Partial<InspectTarget>): void;
}

/**
 * The URL is the inspector's selection state, and the only copy of it. Nothing
 * is mirrored into React state, so a reload, a shared link and the back button
 * all arrive at the same view, and the vocabulary itself stays in the pure
 * `model/inspect-link` where it can be specced without a router.
 */
export function useInspectTarget(): InspectTargetState {
  const router = useRouter();
  const params = useSearchParams();
  const target = useMemo(() => parseInspectTarget(params), [params]);

  const point = useCallback(
    (next: Partial<InspectTarget>) => {
      const merged = normaliseTarget({ ...target, ...next });
      // Replacing a URL with itself would restart every read under it.
      if (sameTarget(target, merged)) return;
      router.replace(inspectHref(merged));
    },
    [router, target],
  );

  return { target, point };
}
