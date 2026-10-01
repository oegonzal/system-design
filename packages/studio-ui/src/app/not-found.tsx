import type { Metadata } from 'next';

import { FullPageNotice } from '../components/full-page-notice';
import { pageTitle } from './nav';

/** Absolute, like every other title: this page sits in the root layout's own segment. */
export const metadata: Metadata = { title: { absolute: pageTitle('Page not found') } };

/** Any address no route answers: the same dead end, with the same way back, as a missing resource. */
export default function NotFound() {
  return (
    <FullPageNotice
      title="Page not found"
      message="Nothing lives at this address. It may have been archived or deleted."
      backHref="/"
    />
  );
}
