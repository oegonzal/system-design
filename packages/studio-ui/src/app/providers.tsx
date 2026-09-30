'use client';

import { ThemeRoot } from '@sysdesign/design-system';
import { EmotionRegistry, LeaveGuardProvider } from '@sysdesign/web-kit';
import type { ReactNode } from 'react';

import { AppShell } from '../components/app-shell';
import { useAppearance } from '../providers/appearance-context';
import { AppearanceProvider } from '../providers/appearance-provider';

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
 * leave guard → themed shell. Server pages render inside as children — RSC
 * content slots through a client component without becoming client code
 * itself. The leave guard sits above the shell so the shell's own links can
 * ask a page whether it is safe to go.
 */
export function Providers({ children }: { children?: ReactNode }) {
  return (
    <EmotionRegistry>
      <AppearanceProvider>
        <LeaveGuardProvider>
          <ThemedShell>{children}</ThemedShell>
        </LeaveGuardProvider>
      </AppearanceProvider>
    </EmotionRegistry>
  );
}
