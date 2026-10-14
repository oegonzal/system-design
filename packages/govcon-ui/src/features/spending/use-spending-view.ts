'use client';

import { useCallback } from 'react';

import { useAddressView, type AddressParams } from '../use-address-view';
import { parseSpendingView, spendingHref, type SpendingView } from './spending-link';

/** The spending view as the address holds it: read and spelled against the profile's own NAICS, which a link without a scope opens on. */
export function useSpendingView(profileNaics: readonly string[]) {
  const parse = useCallback(
    (params: AddressParams) => parseSpendingView(params, profileNaics),
    [profileNaics],
  );
  const hrefOf = useCallback(
    (view: SpendingView) => spendingHref(view, profileNaics),
    [profileNaics],
  );
  return useAddressView(parse, hrefOf);
}
