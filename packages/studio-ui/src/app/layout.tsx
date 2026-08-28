import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: {
    default: 'System Design Studio',
    template: '%s · System Design Studio',
  },
  description:
    'Practice distributed-systems design on an interactive canvas, graded by a critic/eval pipeline.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
