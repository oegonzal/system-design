'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { parseSpendingView, sameView, spendingHref, type SpendingView } from './spending-link';

/**
 * The view as the address holds it, and the one way to change it. A change
 * replaces the address rather than pushing one — a filter is a new address,
 * not a new history entry — and a view that spells the same address is left
 * alone, since replacing a URL with itself would restart every read under it.
 */
export function useSpendingView(profileNaics: readonly string[]) {
  const router = useRouter();
  const params = useSearchParams();
  const view = useMemo(() => parseSpendingView(params, profileNaics), [params, profileNaics]);
  const replace = (next: SpendingView): void => {
    if (sameView(view, next, profileNaics)) return;
    router.replace(spendingHref(next, profileNaics), { scroll: false });
  };
  return { view, replace };
}
