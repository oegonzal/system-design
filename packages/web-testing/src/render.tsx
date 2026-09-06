import type { AppearanceSettings } from '@sysdesign/contracts';
import { ThemeRoot } from '@sysdesign/design-system';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

export interface RenderWithThemeOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Partial appearance override — dark mode, reduced motion, etc. */
  settings?: Partial<AppearanceSettings>;
}

/**
 * Every component under test needs the Emotion theme (any token access on
 * `props.theme` otherwise reads `undefined`). No router wrapper here on
 * purpose — components that touch `next/navigation` mock it per spec.
 */
export function renderWithTheme(
  ui: ReactElement,
  { settings, ...options }: RenderWithThemeOptions = {},
): RenderResult {
  function Wrapper({ children }: { children: ReactNode }) {
    return <ThemeRoot settings={settings}>{children}</ThemeRoot>;
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
