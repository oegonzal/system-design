'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

/** What a view is read from: the address's query, by name. */
export type AddressParams = Pick<URLSearchParams, 'get' | 'getAll'>;

/** One of the declared choices, or the fallback: a URL may say anything, and a view takes only what its vocabulary has. */
export const choose = <T extends string | number>(
  choices: readonly T[],
  raw: string | null,
  fallback: T,
): T => choices.find((choice) => String(choice) === raw) ?? fallback;

/**
 * A page's view as its address holds it, and the one way to change it. The
 * address is the only copy, so a reload, a shared link, a saved view and a
 * return by Back all open the same view. A change replaces the address
 * rather than pushing one — a filter is a new address, not a new history
 * entry — and a view that spells the same address is left alone, since
 * replacing a URL with itself would restart every read under it. `parse`
 * and `hrefOf` are a page's own; pass them stable.
 */
export function useAddressView<V>(
  parse: (params: AddressParams) => V,
  hrefOf: (view: V) => string,
) {
  const router = useRouter();
  const params = useSearchParams();
  const view = useMemo(() => parse(params), [params, parse]);
  const replace = (next: V): void => {
    const href = hrefOf(next);
    if (href === hrefOf(view)) return;
    router.replace(href, { scroll: false });
  };
  return { view, replace };
}
