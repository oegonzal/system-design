import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Govcon',
  description:
    'Pull SAM.gov contract opportunities inside a daily budget, rank what is stored against the company profile, read each lead.',
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
