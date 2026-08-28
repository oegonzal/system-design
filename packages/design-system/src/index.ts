/**
 * @sysdesign/design-system — design tokens, Emotion wiring, and shared
 * primitives for the System Design Studio.
 *
 * Narrow on purpose. `tokens.ts` states that components must not read the
 * primitive tokens directly — they read the semantic ones off `props.theme` —
 * but publishing them from here would make breaking that rule a one-line
 * import. The modules below are still importable by relative path inside this
 * package, which is the only place they have any business being used.
 */

// `theme/tokens`, `theme/accents` and `theme/global` are deliberately not
// re-exported: the first two are inputs to `createTheme`, the third is
// consumed only by `ThemeRoot`. `theme/contrast` is likewise absent — it is a
// QA utility for the specs and the Colors story, not part of the public
// surface.
export type { IntentPair, SpaceIndex } from './theme/tokens';
export type { SemanticColors } from './theme/semantic';

/** The animation vocabulary components compose with; the scale is theme-internal. */
export { fadeInUp, pop, shimmer, slideInUp, slideInDown, spin } from './theme/motion';
export type { MotionTokens } from './theme/motion';

/*
 * `export *`, and it must stay that way: `theme/theme` carries the
 * `declare module '@emotion/react'` augmentation that gives `props.theme` its
 * type. Narrowed to named exports, every token access in a consuming app
 * becomes a property of `{}`.
 */
export * from './theme/theme';
export * from './theme/styled';
export * from './theme-root';
export * from './primitives';
