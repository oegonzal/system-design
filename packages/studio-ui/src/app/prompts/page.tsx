import { Suspense } from 'react';

import { PromptsBrowser } from '../../features/prompts/prompts-browser.client';
import { pageMetadata } from '../nav';

export const metadata = pageMetadata('/prompts');

/** Suspense: the browser reads its filters from the URL (`useSearchParams`), which needs a boundary to prerender. */
export default function PromptsPage() {
  return (
    <Suspense fallback={null}>
      <PromptsBrowser />
    </Suspense>
  );
}
