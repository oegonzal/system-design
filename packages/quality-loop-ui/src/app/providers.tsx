'use client';

import { ThemeRoot } from '@sysdesign/design-system';
import { EmotionRegistry } from '@sysdesign/web-kit';
import type { ReactNode } from 'react';

import { AppShell } from '../components/app-shell';
import { LinkProvider } from '../components/link-context';
import { RouteLink } from './route-link';

/** The client boundary: Emotion SSR registry → the theme → the routed link → the shell. */
export function Providers({ children }: { children?: ReactNode }) {
  return (
    <EmotionRegistry>
      <ThemeRoot>
        <LinkProvider link={RouteLink}>
          <AppShell>{children}</AppShell>
        </LinkProvider>
      </ThemeRoot>
    </EmotionRegistry>
  );
}
