import { Suspense } from 'react';

import { RunWorkspace } from '../features/run/run-workspace';

/** Suspense: `useSearchParams` bails out of static prerender in Next 15 without a boundary. */
export default function RunPage() {
  return (
    <Suspense fallback={null}>
      <RunWorkspace />
    </Suspense>
  );
}
