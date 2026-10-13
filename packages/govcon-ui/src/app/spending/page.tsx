import { Suspense } from 'react';

import { SpendingClient } from '../../features/spending/spending.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/spending');

/** The view reads the address, which bails out of static prerender in Next 15 without a boundary. */
export default function SpendingPage() {
  return (
    <Suspense fallback={null}>
      <SpendingClient />
    </Suspense>
  );
}
