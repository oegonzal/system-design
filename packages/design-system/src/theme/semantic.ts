import type { Accent, ColorMode, NodeKind, Severity } from '@sysdesign/contracts';

import { ACCENT_RAMPS } from './accents';
import { INTENT_PAIRS, MODE_NEUTRALS, SEVERITY_PAIRS, palette, type IntentPair } from './tokens';

/**
 * Semantic tokens — primitives named for their *role*.
 *
 * This is the only colour layer components are allowed to read. Nothing here
 * is a colour a designer picked for a component; every entry is a job, and the
 * mode plus the accent decide which primitive does that job.
 *
 * The `SemanticColors` interface is what makes dark mode safe: a role present
 * in light but forgotten in dark is a compile error rather than an `undefined`
 * in a CSS declaration.
 */

/** The two candidate foregrounds for a fixed tinted surface. */
const INK = palette.neutral[900];
const PAPER = palette.white;

export interface SemanticColors {
  bg: {
    app: string;
    surface: string;
    subtle: string;
    selected: string;
    inverse: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
    onAccent: string;
    onSelected: string;
  };
  border: {
    subtle: string;
    default: string;
    accent: string;
    focus: string;
    none: string;
  };
  accent: {
    default: string;
    hover: string;
    fg: string;
    disabled: string;
  };
  danger: IntentPair;
  success: IntentPair;
  warn: IntentPair;
  info: IntentPair;
  /** One pair per finding severity — the findings panel's whole vocabulary. */
  severity: Record<Severity, IntentPair>;
  nodeKind: Record<NodeKind, string>;
  nodeKindFg: Record<NodeKind, string>;
}

/**
 * Domain palette for the canvas. Typed against the contract's `NodeKind`, so
 * adding a kind to `NODE_KINDS` fails the build here until a colour is chosen
 * — the same trick the API uses to keep its validators honest.
 *
 * Deliberately *not* mode-dependent. A node's colour is domain data — a
 * database is green on any surface, the way a subway line keeps its colour on
 * any map — and `nodeKindFg` pairs each background with its own foreground, so
 * the chips are already self-contained in either mode.
 *
 * The hues group by architectural role, which is what makes a hundred-node
 * diagram scannable: blues for the traffic edge, indigo/violet for compute,
 * greens and teals for data at rest, warm ambers and oranges for caches and
 * messaging (the "hot path"), and neutral grays for the actors the design
 * doesn't own.
 */
const nodeKind = {
  // The actors the design doesn't own.
  client: '#ccd6e3',
  'external-api': '#5d6b7d',
  // The traffic edge — blues, light to deep as requests move inward.
  cdn: '#85c8f2',
  dns: '#b6dcf8',
  gateway: '#2a63ae',
  'load-balancer': '#5a9ade',
  // Compute — indigo and violet.
  service: '#4653c8',
  worker: '#a99bf2',
  scheduler: '#8b5fc2',
  // Data at rest — greens and teals.
  database: '#1d7a4b',
  replica: '#8ed6ab',
  'object-store': '#0f6b74',
  'search-index': '#7fd8d0',
  // Caches and messaging — the warm hot path.
  cache: '#f6c344',
  queue: '#f19a3f',
  'event-stream': '#ad4f12',
} as const satisfies Record<NodeKind, string>;

/**
 * Text colour for each node chip, chosen per background rather than a blanket
 * white.
 *
 * White fails badly on the lighter kinds (cache would sit near 1.6:1) and ink
 * fails on the deep ones, so each background is paired with whichever of
 * ink/white clears 4.5:1 — asserted in `contrast.spec.ts`, not eyeballed.
 */
const nodeKindFg = {
  client: INK,
  'external-api': PAPER,
  cdn: INK,
  dns: INK,
  gateway: PAPER,
  'load-balancer': INK,
  service: PAPER,
  worker: INK,
  scheduler: PAPER,
  database: PAPER,
  replica: INK,
  'object-store': PAPER,
  'search-index': INK,
  cache: INK,
  queue: INK,
  'event-stream': PAPER,
} as const satisfies Record<NodeKind, string>;

export interface SemanticColorInput {
  mode: ColorMode;
  accent: Accent;
}

/**
 * Composes the neutral half of a mode with the accent half.
 *
 * The explicit `SemanticColors` return type is the widening boundary. Without
 * it, `accent.default` would type as the union of all four accents' hexes and
 * grow another member every time a brand colour is added — which is how a
 * single `AppTheme` quietly turns into a different type per accent.
 */
export function createSemanticColors({ mode, accent }: SemanticColorInput): SemanticColors {
  const neutral = MODE_NEUTRALS[mode];
  const ramp = ACCENT_RAMPS[accent][mode];
  const intent = INTENT_PAIRS[mode];
  const severity = SEVERITY_PAIRS[mode];

  return {
    bg: {
      app: neutral.appBg,
      surface: neutral.surfaceBg,
      subtle: neutral.subtleBg,
      selected: ramp.tint,
      inverse: neutral.inverseBg,
    },

    text: {
      primary: neutral.textPrimary,
      secondary: neutral.textSecondary,
      muted: neutral.textMuted,
      inverse: neutral.textInverse,
      onAccent: ramp.onSolid,
      // Secondary text on a selection tint. `text.muted` clears 4.5:1 there
      // too, but only just; this role exists so a component that needs
      // headroom has somewhere legitimate to go.
      onSelected: ramp.onTint,
    },

    border: {
      subtle: neutral.borderSubtle,
      default: neutral.borderDefault,
      accent: ramp.solid,
      focus: ramp.ring,
      none: palette.transparent,
    },

    accent: {
      default: ramp.solid,
      hover: ramp.solidHover,
      fg: ramp.onSolid,
      disabled: neutral.disabledFill,
    },

    danger: { ...intent.danger },
    success: { ...intent.success },
    warn: { ...intent.warn },
    info: { ...intent.info },

    severity: {
      critical: { ...severity.critical },
      high: { ...severity.high },
      medium: { ...severity.medium },
      low: { ...severity.low },
      info: { ...severity.info },
    },

    nodeKind: { ...nodeKind },
    nodeKindFg: { ...nodeKindFg },
  };
}
