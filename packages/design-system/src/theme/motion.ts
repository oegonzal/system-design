import { keyframes } from '@emotion/react';
import type { MotionLevel } from '@sysdesign/contracts';

/**
 * The motion layer.
 *
 * The design decision that shapes everything else: **a duration token is a
 * `var(--motion-duration-*)` reference, not a number of milliseconds.**
 *
 * A component still reads a semantic role —
 * `transition: opacity ${theme.motion.duration.normal} ${theme.motion.easing.standard}` —
 * but the value resolves through a custom property that `globalStyles` emits
 * once. Three things fall out of that:
 *
 * - the configured level applies without re-serialising a single rule;
 * - `prefers-reduced-motion` overrides the same variables later in the same
 *   stylesheet, so the OS preference wins with zero JavaScript and zero
 *   re-render;
 * - a component author *cannot forget* to honour that preference, because they
 *   never wrote a duration in the first place.
 *
 * This is the one place a CSS custom property is strictly better than a JS
 * token, and it is worth the second channel precisely because the alternative —
 * every component remembering its own `@media (prefers-reduced-motion)` block —
 * is the discipline failure the token layer exists to eliminate.
 */

export interface DurationScale {
  instant: string;
  fast: string;
  normal: string;
  slow: string;
}

export interface EasingScale {
  standard: string;
  emphasized: string;
  exit: string;
}

export interface MotionMilliseconds {
  instant: number;
  fast: number;
  normal: number;
  slow: number;
}

export interface MotionTokens {
  /** Needed in JS by Spinner and Skeleton: `reduced` is a *setting*, not a media query. */
  level: MotionLevel;
  /** `var(--motion-duration-*)` references — what components interpolate. */
  duration: DurationScale;
  easing: EasingScale;
  /** Raw milliseconds, for `globalStyles` to emit and for specs. Not for components. */
  ms: MotionMilliseconds;
  /** Travel distance for entrance animations, in pixels. */
  distancePx: number;
}

const BASE_MS: MotionMilliseconds = { instant: 80, fast: 150, normal: 240, slow: 400 };

/**
 * `reduced` means 0ms, not "no animation": a 0ms transition still fires
 * `transitionend`, so nothing awaiting completion hangs, and with
 * `animation-fill-mode: both` an element lands on its end state rather than
 * getting stranded at `opacity: 0`.
 */
const TIME_SCALE = { full: 1, reduced: 0 } as const satisfies Record<MotionLevel, number>;

/**
 * Distance is a separate axis from duration: a translate at any speed is still
 * vestibular motion, so `reduced` zeroes the travel as well as the clock.
 */
const DISTANCE_PX = { full: 12, reduced: 0 } as const satisfies Record<MotionLevel, number>;

/** Easing does not vary by level. One fewer axis to reason about. */
export const EASING: EasingScale = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  exit: 'cubic-bezier(0.3, 0, 1, 1)',
};

/**
 * The baked-in fallback after each `var()` keeps a component rendered outside
 * a `<Global>` — a Storybook docs snippet, say — behaving sensibly rather than
 * animating for `0s`.
 */
export function createMotion(level: MotionLevel): MotionTokens {
  const scale = TIME_SCALE[level];
  const ms: MotionMilliseconds = {
    instant: Math.round(BASE_MS.instant * scale),
    fast: Math.round(BASE_MS.fast * scale),
    normal: Math.round(BASE_MS.normal * scale),
    slow: Math.round(BASE_MS.slow * scale),
  };

  return {
    level,
    ms,
    distancePx: DISTANCE_PX[level],
    easing: EASING,
    duration: {
      instant: `var(--motion-duration-instant, ${ms.instant}ms)`,
      fast: `var(--motion-duration-fast, ${ms.fast}ms)`,
      normal: `var(--motion-duration-normal, ${ms.normal}ms)`,
      slow: `var(--motion-duration-slow, ${ms.slow}ms)`,
    },
  };
}

/**
 * Shared keyframes.
 *
 * Interpolate these (``animation: ${fadeInUp} …``), never stringify them: a
 * stringified `Keyframes` skips Emotion's registration step and the animation
 * silently does nothing.
 *
 * The translating ones read `var(--motion-distance)` rather than taking a
 * parameter, so the motion level reaches them through the same channel as the
 * durations.
 */

/** List entry — a finding arriving in the evaluation panel. Stagger with `animation-delay`, capped. */
export const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(var(--motion-distance, 12px)); }
  to   { opacity: 1; transform: none; }
`;

/** Selection feedback — a node dropped on the canvas, a score chip updating. */
export const pop = keyframes`
  0%   { transform: scale(1); }
  45%  { transform: scale(1.05); }
  100% { transform: scale(1); }
`;

/** Skeleton placeholder. Infinite — see the reduced-motion note in `global.ts`. */
export const shimmer = keyframes`
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
`;

/** A bottom panel arriving — the evaluation drawer. */
export const slideInUp = keyframes`
  from { opacity: 0; transform: translateY(calc(var(--motion-distance, 12px) * 1.5)); }
  to   { opacity: 1; transform: none; }
`;

/** A dropdown or palette flyout opening. */
export const slideInDown = keyframes`
  from { opacity: 0; transform: translateY(calc(var(--motion-distance, 12px) * -0.5)); }
  to   { opacity: 1; transform: none; }
`;

/** Spinner. Infinite, and stopped rather than sped up under reduced motion. */
export const spin = keyframes`
  to { transform: rotate(360deg); }
`;
