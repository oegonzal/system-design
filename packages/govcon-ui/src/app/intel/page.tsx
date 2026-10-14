import { Suspense } from 'react';

import { IntelClient } from '../../features/intel/intel.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/intel');

/** The view reads the address, which bails out of static prerender in Next 15 without a boundary. */
export default function IntelPage() {
  return (
    <Suspense fallback={null}>
      <IntelClient />
    </Suspense>
  );
}
