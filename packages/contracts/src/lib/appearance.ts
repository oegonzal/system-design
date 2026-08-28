/**
 * Appearance settings vocabulary.
 *
 * Single-user app: these live in the browser (localStorage), not the API —
 * but the tuples sit in contracts because three sides consume them: the
 * design system's token tables (`satisfies Record<...>`), the settings page's
 * option lists, and the Storybook toolbar.
 */
export const COLOR_MODES = ['light', 'dark'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const ACCENTS = ['blueprint', 'teal', 'violet', 'slate'] as const;
export type Accent = (typeof ACCENTS)[number];

export const MOTION_LEVELS = ['full', 'reduced'] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

export interface AppearanceSettings {
  colorMode: ColorMode;
  accent: Accent;
  motion: MotionLevel;
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  colorMode: 'light',
  accent: 'blueprint',
  motion: 'full',
};
