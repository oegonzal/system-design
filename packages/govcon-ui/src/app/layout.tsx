import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { APP_NAME, pageTitle } from './nav';
import { Providers } from './providers';

/** A route without its own row still carries the app's name, in the table's own form. */
export const metadata: Metadata = {
  title: { default: APP_NAME, template: pageTitle('%s') },
  description:
    'Find and bid on federal contract opportunities: pull SAM.gov inside a daily budget, rank the store against your profile, track bids, read the award history.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
