'use client';

import { ThemeRoot } from '@sysdesign/design-system';
import { EmotionRegistry } from '@sysdesign/web-kit';
import type { ReactNode } from 'react';

import { AppShell } from '../components/app-shell';
import { LinkProvider } from '../components/link-context';
import { ProfileProvider } from '../providers/profile-context';
import { RouteLink } from './route-link';

/** The client boundary: Emotion SSR registry → the theme → the routed link → the profile choice → the shell. */
export function Providers({ children }: { children?: ReactNode }) {
  return (
    <EmotionRegistry>
      <ThemeRoot>
        <LinkProvider link={RouteLink}>
          <ProfileProvider>
            <AppShell>{children}</AppShell>
          </ProfileProvider>
        </LinkProvider>
      </ThemeRoot>
    </EmotionRegistry>
  );
}
