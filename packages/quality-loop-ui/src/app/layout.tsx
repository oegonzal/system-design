import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { APP_NAME, pageTitle } from './nav';
import { Providers } from './providers';

/** A route without its own row still carries the app's name, in the table's own form. */
export const metadata: Metadata = {
  title: { default: APP_NAME, template: pageTitle('%s') },
  description:
    'Run a critic/evaluator/controller pipeline over a prompt, then inspect what the machine did.',
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
