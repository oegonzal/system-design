import type { ColorMode, Severity } from '@sysdesign/contracts';

/**
 * Primitive tokens — the raw values, named for *what they are*.
 *
 * Components must not read these directly. They read the semantic layer in
 * `semantic.ts`, which names values for *what they are for*. That indirection
 * is what makes a second colour mode a change to this file rather than to
 * every component.
 */

/**
 * Two independently authored neutral ramps, both leaning cool — the app is a
 * drafting table, and blue-gray paper is the look the whole surface hangs on.
 *
 * `ink` is not `neutral` inverted. An inverted ramp produces the classic bad
 * dark theme: pure-black surfaces, over-bright text and shadows that vanish.
 * Both ramps run 50 (lightest) → 900 (darkest) so the ordering reads the same
 * either way; which end is "background" is the mode's business, not the
 * ramp's.
 */
export const palette = {
  white: '#ffffff',
  transparent: 'transparent',

  neutral: {
    50: '#f3f6fa', // light app background
    100: '#eaf0f7', // subtle fills
    200: '#d3dae4', // decorative hairlines
    300: '#bfc8d4', // decorative accents — below 3:1, see `neutral[500]`
    400: '#a3b1c2', // disabled surfaces
    500: '#76839a', // control borders — clears WCAG 1.4.11 on every bg role
    600: '#5d6a7e', // muted text — clears 4.5:1 on every bg role, tint included
    700: '#3a4657', // secondary text
    900: '#171e2b', // primary text
  },

  ink: {
    50: '#e6ebf4', // dark-mode primary text
    100: '#bfc8d8', // secondary text
    200: '#98a4b8', // muted text
    300: '#68768c', // control borders
    400: '#475466', // disabled surfaces
    500: '#384356',
    600: '#2a3444', // decorative hairlines
    700: '#212938', // subtle fills
    800: '#181f2b', // surfaces
    900: '#10161f', // app background
  },
} as const;

/**
 * The neutral half of a colour mode. The accent half comes from `accents.ts`;
 * `semantic.ts` composes the two.
 *
 * Named roles rather than ramp indices, because "which step of the ramp is the
 * border" is a decision that should be made once, here, not at every call
 * site.
 */
export interface NeutralRoles {
  appBg: string;
  surfaceBg: string;
  subtleBg: string;
  inverseBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  borderSubtle: string;
  borderDefault: string;
  disabledFill: string;
}

export const MODE_NEUTRALS = {
  light: {
    appBg: palette.neutral[50],
    surfaceBg: palette.white,
    subtleBg: palette.neutral[100],
    inverseBg: palette.neutral[900],
    textPrimary: palette.neutral[900],
    textSecondary: palette.neutral[700],
    textMuted: palette.neutral[600],
    textInverse: palette.white,
    borderSubtle: palette.neutral[200],
    borderDefault: palette.neutral[500],
    disabledFill: palette.neutral[400],
  },
  dark: {
    appBg: palette.ink[900],
    surfaceBg: palette.ink[800],
    subtleBg: palette.ink[700],
    inverseBg: palette.ink[50],
    textPrimary: palette.ink[50],
    textSecondary: palette.ink[100],
    textMuted: palette.ink[200],
    textInverse: palette.ink[900],
    borderSubtle: palette.ink[600],
    borderDefault: palette.ink[300],
    disabledFill: palette.ink[400],
  },
} as const satisfies Record<ColorMode, NeutralRoles>;

/** A background paired with text that is legible on it. */
export interface IntentPair {
  bg: string;
  fg: string;
}

export interface IntentRoles {
  danger: IntentPair;
  success: IntentPair;
  warn: IntentPair;
  info: IntentPair;
}

/**
 * Statuses a surface can carry. Light mode pairs a pale tint with a deep
 * foreground; dark mode inverts the weight — deep tint, light foreground —
 * because a pale tint on an ink page glows like a sticker.
 */
export const INTENT_PAIRS = {
  light: {
    danger: { bg: '#fdeceb', fg: '#a12622' },
    success: { bg: '#e3f3e9', fg: '#1e6b40' },
    warn: { bg: '#fcf0dc', fg: '#7a5302' },
    info: { bg: palette.neutral[100], fg: palette.neutral[700] },
  },
  dark: {
    danger: { bg: '#3a1c1c', fg: '#ffa8a3' },
    success: { bg: '#15301f', fg: '#92d9ab' },
    warn: { bg: '#372a10', fg: '#e5c06c' },
    info: { bg: palette.ink[700], fg: palette.ink[100] },
  },
} as const satisfies Record<ColorMode, IntentRoles>;

/**
 * One pair per finding severity, typed against the contract tuple so a new
 * severity refuses to compile until it has colours in both modes. The ordering
 * of hue is deliberate — red → orange → amber → blue → neutral — so a findings
 * list reads as a gradient of urgency rather than a fruit salad.
 *
 * `critical` shares the danger pair and `info` the info pair on purpose:
 * "critical finding" and "destructive action" should look like the same class
 * of event.
 */
export const SEVERITY_PAIRS = {
  light: {
    critical: { bg: '#fdeceb', fg: '#a12622' },
    high: { bg: '#fcefe4', fg: '#9a430a' },
    medium: { bg: '#f9f0d9', fg: '#775502' },
    low: { bg: '#e7f0fb', fg: '#1d5a9e' },
    info: { bg: palette.neutral[100], fg: palette.neutral[700] },
  },
  dark: {
    critical: { bg: '#3a1c1c', fg: '#ffa8a3' },
    high: { bg: '#3a2515', fg: '#ffb583' },
    medium: { bg: '#372d10', fg: '#e9c268' },
    low: { bg: '#16283d', fg: '#9cc7f2' },
    info: { bg: palette.ink[700], fg: palette.ink[100] },
  },
} as const satisfies Record<ColorMode, Record<Severity, IntentPair>>;

/**
 * Nine steps, fixed length.
 *
 * `as const` arity is the one thing the tuple type must preserve:
 * `theme.space[9]` stays a compile error rather than becoming `undefined`.
 * `noUncheckedIndexedAccess` is off, so a plain `readonly number[]` would type
 * an out-of-range index as `number` and render `NaNpx` at runtime.
 */
export type SpaceScale = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** `0 | 1 | … | 8`, derived so adding a step needs no second edit. */
export type SpaceIndex =
  Exclude<keyof SpaceScale, keyof (readonly unknown[])> extends infer K
    ? K extends `${infer N extends number}`
      ? N
      : never
    : never;

/** The 4px grid, with 2px for hairline-adjacent gaps. */
export const SPACE: SpaceScale = [0, 2, 4, 8, 12, 16, 24, 32, 48];

export interface RadiusScale {
  sm: string;
  md: string;
  lg: string;
  pill: string;
}

export const RADIUS: RadiusScale = { sm: '4px', md: '6px', lg: '10px', pill: '999px' };

export interface ShadowScale {
  sm: string;
  md: string;
  lg: string;
}

/**
 * Shadows are mode-dependent: a shadow tuned for a white page is invisible on
 * a dark one, which is why dark mode leans on much higher alpha.
 */
export const SHADOWS = {
  light: {
    sm: '0 1px 2px rgba(23, 30, 43, 0.08)',
    md: '0 2px 8px rgba(23, 30, 43, 0.12)',
    lg: '0 8px 24px rgba(23, 30, 43, 0.16)',
  },
  dark: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
    md: '0 2px 10px rgba(0, 0, 0, 0.6)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.7)',
  },
} as const satisfies Record<ColorMode, ShadowScale>;

export const fontSize = {
  xs: '10px',
  sm: '12px',
  md: '14px',
  lg: '16px',
  xl: '18px',
  xxl: '24px',
} as const;

export const fontWeight = {
  regular: 400,
  semibold: 600,
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
} as const;

export const fontFamily = {
  base: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
} as const;

export const zIndex = {
  base: 0,
  sticky: 10,
  popover: 50,
  overlay: 100,
} as const;

/** Min-width breakpoints; use via `theme.media.*`. */
export const breakpoint = {
  sm: '480px',
  md: '768px',
  lg: '1024px',
} as const;
