import { Suspense } from 'react';

import { InspectorClient } from '../../features/inspector/inspector.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/inspect');

/** Suspense: `useSearchParams` bails out of static prerender in Next 15 without a boundary. */
export default function InspectPage() {
  return (
    <Suspense fallback={null}>
      <InspectorClient />
    </Suspense>
  );
}
