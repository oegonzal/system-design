import { Suspense } from 'react';

import { PromptComposer } from '../../../features/prompts/prompt-composer.client';
import { pageMetadata } from '../../nav';

export const metadata = pageMetadata('/prompts/new');

/** Suspense: the composer reads its seed from the URL (`useSearchParams`), which needs a boundary to prerender. */
export default function NewPromptPage() {
  return (
    <Suspense fallback={null}>
      <PromptComposer />
    </Suspense>
  );
}
