import type { Accent, ColorMode } from '@sysdesign/contracts';

/**
 * The accent half of a colour mode.
 *
 * Six values, because that is genuinely how many an accent needs once buttons,
 * selection tints, focus rings and hover states all have to stay legible. This
 * is the interface a hex picker would have to satisfy if one were ever added
 * (`deriveRamp(hex, mode): AccentRamp`), which is why the rest of the system
 * depends on the shape rather than on a colour.
 */
export interface AccentRamp {
  /** Filled control background; also `border.accent`. */
  solid: string;
  /**
   * Hover and active state of `solid`.
   *
   * Light mode darkens. Dark mode **lightens** — hover means "closer to the
   * foreground", and darkening on a dark page reads as disabled.
   */
  solidHover: string;
  /** Text and icons on `solid`. */
  onSolid: string;
  /** Low-chroma tint for selected cards and rows -> `bg.selected`. */
  tint: string;
  /** Text on `tint` when the muted role would be too light. */
  onTint: string;
  /** Focus ring -> `border.focus`. Clears 3:1 on both `bg.app` and `bg.surface`. */
  ring: string;
}

/**
 * Four accents covering four hue families.
 *
 * `blueprint` is the default and the identity: the indigo-blue of drafting
 * ink on cool paper. `slate` is the "no brand colour" option, and the stress
 * case where `solid` still has to separate from `border.default`.
 *
 * The non-obvious rule, and the reason dark mode cannot be bolted on later:
 * **in dark mode `solid` gets lighter and `onSolid` flips to ink.** White on
 * accent lands between 2:1 and 3:1 in dark mode for every one of these four,
 * so a hardcoded `accent.fg = white` would fail dark mode universally.
 *
 * Every pair below is asserted in `contrast.spec.ts`; nothing here was chosen
 * by eye.
 */
export const ACCENT_RAMPS = {
  blueprint: {
    light: {
      solid: '#3453b4',
      solidHover: '#28418f',
      onSolid: '#ffffff',
      tint: '#e6ecfa',
      onTint: '#2c4494',
      ring: '#3453b4',
    },
    dark: {
      solid: '#8fa9f0',
      solidHover: '#adc0f5',
      onSolid: '#10161f',
      tint: '#1c2542',
      onTint: '#bccaf6',
      ring: '#8fa9f0',
    },
  },
  teal: {
    light: {
      solid: '#0c6d66',
      solidHover: '#095650',
      onSolid: '#ffffff',
      tint: '#daf1ee',
      onTint: '#0a524d',
      ring: '#0c6d66',
    },
    dark: {
      solid: '#4cc4b8',
      solidHover: '#71d2c8',
      onSolid: '#10161f',
      tint: '#0f302d',
      onTint: '#8fdcd4',
      ring: '#4cc4b8',
    },
  },
  violet: {
    light: {
      solid: '#743cba',
      solidHover: '#5e3097',
      onSolid: '#ffffff',
      tint: '#f1eafa',
      onTint: '#5c2f96',
      ring: '#743cba',
    },
    dark: {
      solid: '#b795ec',
      solidHover: '#c9adf2',
      onSolid: '#10161f',
      tint: '#291b40',
      onTint: '#d0baf4',
      ring: '#b795ec',
    },
  },
  slate: {
    light: {
      solid: '#4c5a70',
      solidHover: '#3c4759',
      onSolid: '#ffffff',
      tint: '#eaeff5',
      onTint: '#38455a',
      ring: '#4c5a70',
    },
    dark: {
      solid: '#9fb2cc',
      solidHover: '#b6c5da',
      onSolid: '#10161f',
      tint: '#202836',
      onTint: '#c6d2e4',
      ring: '#9fb2cc',
    },
  },
} as const satisfies Record<Accent, Record<ColorMode, AccentRamp>>;
