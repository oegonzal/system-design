import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Govcon', template: '%s · Govcon' },
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
