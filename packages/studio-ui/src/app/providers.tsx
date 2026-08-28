'use client';

import { ThemeRoot } from '@sysdesign/design-system';
import type { ReactNode } from 'react';

import { AppShell } from '../components/app-shell';
import { useAppearance } from '../providers/appearance-context';
import { AppearanceProvider } from '../providers/appearance-provider';
import { EmotionRegistry } from './emotion-registry';

/** Bridges the appearance context into the design system's ThemeRoot. */
function ThemedShell({ children }: { children?: ReactNode }) {
  const appearance = useAppearance();
  return (
    <ThemeRoot settings={appearance}>
      <AppShell>{children}</AppShell>
    </ThemeRoot>
  );
}

/**
 * The client boundary of the app: Emotion SSR registry → appearance state →
 * themed shell. Server pages render inside as children — RSC content slots
 * through a client component without becoming client code itself.
 */
export function Providers({ children }: { children?: ReactNode }) {
  return (
    <EmotionRegistry>
      <AppearanceProvider>
        <ThemedShell>{children}</ThemedShell>
      </AppearanceProvider>
    </EmotionRegistry>
  );
}
