import { Suspense } from 'react';

import { SearchClient } from '../../features/search/search.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/search');

/** The view reads the address, which bails out of static prerender in Next 15 without a boundary. */
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchClient />
    </Suspense>
  );
}
