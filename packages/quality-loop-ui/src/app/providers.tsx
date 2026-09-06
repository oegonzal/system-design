'use client';

import { ThemeRoot } from '@sysdesign/design-system';
import { EmotionRegistry } from '@sysdesign/web-kit';
import type { ReactNode } from 'react';

import { Shell } from '../components/shell';

/** The client boundary: Emotion SSR registry → the default theme → the page shell. */
export function Providers({ children }: { children?: ReactNode }) {
  return (
    <EmotionRegistry>
      <ThemeRoot>
        <Shell>{children}</Shell>
      </ThemeRoot>
    </EmotionRegistry>
  );
}
