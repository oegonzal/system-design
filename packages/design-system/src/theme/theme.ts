import type { AppearanceSettings, ColorMode } from '@sysdesign/contracts';

import { createMotion, type MotionTokens } from './motion';
import { createSemanticColors, type SemanticColors } from './semantic';
import {
  RADIUS,
  SHADOWS,
  SPACE,
  breakpoint,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  zIndex,
  type RadiusScale,
  type ShadowScale,
  type SpaceScale,
} from './tokens';

export interface FontTokens {
  family: typeof fontFamily;
  size: typeof fontSize;
  weight: typeof fontWeight;
  lineHeight: typeof lineHeight;
}

export interface MediaQueries {
  sm: string;
  md: string;
  lg: string;
  /**
   * For the handful of components that genuinely need to branch in CSS —
   * Spinner and Skeleton, whose animations are infinite and so cannot be
   * fixed by duration clamping alone.
   */
  reducedMotion: string;
}

/**
 * The theme, written out rather than inferred.
 *
 * An explicit return type on `createTheme` is the widening boundary for the
 * whole token layer. Inferred, `color.accent.default` would be the union of
 * every accent's hex and would gain a member each time a brand colour is
 * added, so `AppTheme` would silently stop being one type and components
 * would start type-checking against whichever settings happened to produce
 * their instance.
 *
 * Note what is *not* here: no `settings` and no `accent`. A component that
 * branches on `theme.settings.accent` has escaped the semantic layer. Only
 * `mode` and `motion.level` survive as configuration facts, each because a
 * component genuinely cannot express them in CSS alone.
 */
export interface AppTheme {
  mode: ColorMode;
  color: SemanticColors;
  space: SpaceScale;
  radius: RadiusScale;
  motion: MotionTokens;
  shadow: ShadowScale;
  font: FontTokens;
  zIndex: typeof zIndex;
  breakpoint: typeof breakpoint;
  media: MediaQueries;
}

export function createTheme(settings: AppearanceSettings): AppTheme {
  const { colorMode, accent, motion } = settings;

  return {
    mode: colorMode,
    color: createSemanticColors({ mode: colorMode, accent }),
    space: SPACE,
    radius: RADIUS,
    motion: createMotion(motion),
    shadow: SHADOWS[colorMode],
    font: { family: fontFamily, size: fontSize, weight: fontWeight, lineHeight },
    zIndex,
    breakpoint,
    media: {
      sm: `@media (min-width: ${breakpoint.sm})`,
      md: `@media (min-width: ${breakpoint.md})`,
      lg: `@media (min-width: ${breakpoint.lg})`,
      reducedMotion: '@media (prefers-reduced-motion: reduce)',
    },
  };
}

/**
 * Teaches Emotion what `props.theme` is.
 *
 * This augmentation lives in `theme.ts` rather than a standalone `.d.ts` on
 * purpose: a declaration file is only applied if it happens to land in the
 * TypeScript program, whereas every consumer imports this module by
 * definition. Without it, `props.theme` is `{}` and every token access is a
 * type error.
 */
declare module '@emotion/react' {
  // An empty interface is the required shape for a module augmentation: it is
  // widening Emotion's Theme, not declaring a type of its own.
  // eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
  export interface Theme extends AppTheme {}
}
