import { Global, ThemeProvider, useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import { DEFAULT_APPEARANCE_SETTINGS, type AppearanceSettings } from '@sysdesign/contracts';
import { useEffect, useMemo, type ReactNode } from 'react';

import { globalStyles, scopedThemeStyles } from './theme/global';
import { createTheme, type AppTheme } from './theme/theme';

export interface ThemeRootProps {
  children?: ReactNode;
  /**
   * `Partial` so a caller can override one knob —
   * `<ThemeRoot settings={{ colorMode: 'dark' }}>` — and so adding a knob
   * later does not break every existing test. Optional for the same reason
   * `children` is: it keeps `render(ui, { wrapper: ThemeRoot })`
   * type-checking.
   */
  settings?: Partial<AppearanceSettings>;
}

const PreviewScope = styled.div`
  ${({ theme }) => scopedThemeStyles(theme)}
`;

/**
 * The one definition of "a themed React tree".
 *
 * Four places need it: the app shell, the test helper, Storybook's preview
 * decorator, and the settings page's live preview.
 *
 * `ThemeRoot` never reads storage or fetches. Appearance settings live in the
 * browser and belong to the app's settings provider, which renders
 * `<ThemeRoot settings={…}>` — the design system must not know where the
 * values come from. That boundary is the likeliest thing to get wrong here.
 */
export function ThemeRoot({ children, settings }: ThemeRootProps) {
  const { colorMode, accent, motion } = { ...DEFAULT_APPEARANCE_SETTINGS, ...settings };

  /**
   * Emotion returns `{}` when there is no provider above, so a truthy `mode`
   * means this root is nested inside another one. A nested root must not
   * write document-level styles or attributes: the settings page renders a
   * second root to preview a draft, and it would otherwise clobber the live
   * theme.
   */
  const outer = useTheme() as Partial<AppTheme>;
  const isNested = Boolean(outer.mode);

  // The three scalars, not the `settings` object — every call site passes an
  // object literal, so an identity dependency would rebuild the theme on
  // every render and invalidate the provider's context value for the whole
  // tree.
  const theme = useMemo(
    () => createTheme({ colorMode, accent, motion }),
    [colorMode, accent, motion],
  );

  useEffect(() => {
    if (isNested) return;

    // Exposes the resolved theme to end-to-end tests without reading
    // Emotion-generated class names, which nothing may depend on.
    const root = document.documentElement;
    root.dataset['colorMode'] = colorMode;
    root.dataset['accent'] = accent;
  }, [isNested, colorMode, accent]);

  if (isNested) {
    return (
      <ThemeProvider theme={theme}>
        <PreviewScope>{children}</PreviewScope>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Global styles={globalStyles} />
      {children}
    </ThemeProvider>
  );
}
