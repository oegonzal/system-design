import { Suspense } from 'react';

import { PipelineClient } from '../../features/pipeline/pipeline.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/pipeline');

/** The view reads the address, which bails out of static prerender in Next 15 without a boundary. */
export default function PipelinePage() {
  return (
    <Suspense fallback={null}>
      <PipelineClient />
    </Suspense>
  );
}
