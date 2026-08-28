import { css, type SerializedStyles } from '@emotion/react';

import type { AppTheme } from './theme';

/**
 * The motion channel, as CSS custom properties.
 *
 * Declared once and interpolated by both the global and the scoped
 * stylesheet, so the configured level and the reduced-motion override can
 * never drift apart between them.
 */
const motionProperties = (theme: AppTheme) => `
  --motion-duration-instant: ${theme.motion.ms.instant}ms;
  --motion-duration-fast: ${theme.motion.ms.fast}ms;
  --motion-duration-normal: ${theme.motion.ms.normal}ms;
  --motion-duration-slow: ${theme.motion.ms.slow}ms;
  --motion-distance: ${theme.motion.distancePx}px;
`;

/**
 * The operating system's answer, which is a floor the stored setting can
 * lower but never raise.
 */
const REDUCED_MOTION_PROPERTIES = `
  --motion-duration-instant: 0.01ms;
  --motion-duration-fast: 0.01ms;
  --motion-duration-normal: 0.01ms;
  --motion-duration-slow: 0.01ms;
  --motion-distance: 0px;
`;

/**
 * Reset, base typography, and the two global channels the token layer needs:
 * `color-scheme` and the motion custom properties.
 *
 * Exported as a function of the theme rather than as a module-level
 * `SerializedStyles`, because both channels are mode- and settings-dependent.
 * `<Global styles={globalStyles} />` is unchanged at the call site — Emotion's
 * `styles` prop accepts a function of the theme — and it still contains no
 * JSX, so `src/theme/` stays renderer-agnostic.
 */
export const globalStyles = (theme: AppTheme): SerializedStyles => css`
  :root {
    /*
     * The only place \`color-scheme\` can live. It is what makes native chrome
     * follow the configured mode: the <select> dropdown, scrollbars, the
     * caret, form controls. Without it a dark theme has light scrollbars.
     */
    color-scheme: ${theme.mode};
    ${motionProperties(theme)}
  }

  /*
   * MUST stay immediately after the block above, and MUST stay after it.
   *
   * Same specificity, so source order is the entire mechanism by which the
   * operating system's preference beats the stored motion level. Reordering
   * these silently breaks WCAG 2.3.3.
   */
  @media (prefers-reduced-motion: reduce) {
    :root {
      ${REDUCED_MOTION_PROPERTIES}
    }

    /*
     * Clamping durations is not enough for an infinite animation: a shimmer
     * running at 0.01ms is a ~100Hz strobe, considerably worse than the
     * motion it replaced.
     */
    *,
    *::before,
    *::after {
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
    }
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    height: 100%;
  }

  /* On html as well as body, so overscroll does not reveal a white gap. */
  html {
    background: ${theme.color.bg.app};
  }

  body {
    margin: 0;
    font-family: ${theme.font.family.base};
    font-size: ${theme.font.size.md};
    line-height: ${theme.font.lineHeight.normal};
    color: ${theme.color.text.primary};
    background: ${theme.color.bg.app};
    -webkit-font-smoothing: antialiased;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
    color: inherit;
  }

  img {
    display: block;
  }

  /* Visible focus for keyboard users, suppressed for pointer clicks. */
  :focus-visible {
    outline: 2px solid ${theme.color.border.focus};
    /*
     * Load-bearing for contrast, not decoration. The ring colour equals
     * accent.default, so ring-against-a-filled-button is 1.00:1; the offset
     * is what puts the ring on the page background instead. Removing it
     * destroys WCAG 2.4.11 silently.
     */
    outline-offset: 2px;
  }
`;

/**
 * The same channels, scoped to a subtree instead of the document.
 *
 * Used by a nested `ThemeRoot` — the settings page previews a draft theme
 * inside the live one. A second `<Global>` would write competing rules into
 * the document head and the winner would depend on insertion order, so a
 * nested root emits this instead and the preview stays contained.
 */
export const scopedThemeStyles = (theme: AppTheme): SerializedStyles => css`
  color-scheme: ${theme.mode};
  ${motionProperties(theme)}
  color: ${theme.color.text.primary};
  background: ${theme.color.bg.app};

  @media (prefers-reduced-motion: reduce) {
    ${REDUCED_MOTION_PROPERTIES}
  }
`;
