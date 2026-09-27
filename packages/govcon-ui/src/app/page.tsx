import { Suspense } from 'react';

import { GovconWorkspace } from '../features/workspace/govcon-workspace';

/** Suspense: `useSearchParams` bails out of static prerender in Next 15 without a boundary. */
export default function GovconPage() {
  return (
    <Suspense fallback={null}>
      <GovconWorkspace />
    </Suspense>
  );
}
