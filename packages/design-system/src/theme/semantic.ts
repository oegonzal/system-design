import {
  NODE_KINDS,
  NODE_KIND_CATEGORY,
  type Accent,
  type ColorMode,
  type NodeKind,
  type NodeKindCategoryId,
  type Severity,
} from '@sysdesign/contracts';

import { ACCENT_RAMPS } from './accents';
import {
  CHART_SERIES,
  INTENT_PAIRS,
  MODE_NEUTRALS,
  SEVERITY_PAIRS,
  palette,
  type ChartSeriesScale,
  type IntentPair,
} from './tokens';

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
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    onSelected: string;
  };
  border: {
    subtle: string;
    default: string;
    accent: string;
    focus: string;
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
  /** Category anchor hue — heading dots, legends, anywhere a shelf needs a swatch. */
  nodeKindCategory: Record<NodeKindCategoryId, string>;
  /** Data-series hues for charts, by slot in a fixed order; a chart never cycles past them. */
  chart: { series: ChartSeriesScale };
}

/**
 * Domain palette for the canvas, authored *per category* rather than per
 * kind: colour answers "what architectural role is this?", and per-kind
 * identity is the icon's job. Typed against the contract's
 * `NodeKindCategoryId`, so declaring a category fails the build here until a
 * colour is chosen — the same trick the API uses to keep its validators
 * honest.
 *
 * Deliberately *not* mode-dependent. A node's colour is domain data — a
 * database is green on any surface, the way a subway line keeps its colour on
 * any map — and each `fg` pairs its background with its own foreground
 * (whichever of ink/white clears 4.5:1 — asserted in `contrast.spec.ts`, not
 * eyeballed), so the chips are self-contained in either mode.
 *
 * The hues keep their long-standing anchors, which is what makes a
 * hundred-node diagram scannable: light blue at the client edge, deep blues
 * for traffic, indigo for compute, greens and teals for data at rest, warm
 * ambers and oranges for caches and messaging (the "hot path"), and neutral
 * gray for the actors the design doesn't own.
 */
export const CATEGORY_COLORS = {
  'clients-edge': { bg: '#85c8f2', fg: INK },
  traffic: { bg: '#2a63ae', fg: PAPER },
  compute: { bg: '#4653c8', fg: PAPER },
  'data-stores': { bg: '#1d7a4b', fg: PAPER },
  caching: { bg: '#f6c344', fg: INK },
  messaging: { bg: '#f19a3f', fg: INK },
  analytics: { bg: '#0f6b74', fg: PAPER },
  coordination: { bg: '#8b5fc2', fg: PAPER },
  security: { bg: '#a63a50', fg: PAPER },
  observability: { bg: '#8f4b8f', fg: PAPER },
  external: { bg: '#5d6b7d', fg: PAPER },
} as const satisfies Record<NodeKindCategoryId, { bg: string; fg: string }>;

/**
 * Escape hatch for a kind that must not wear its category's colour. Empty on
 * purpose — per-kind identity is the icon's job — and an entry must supply
 * *both* `bg` and `fg` as a pair: half an override would silently pair a
 * custom background with the category's foreground and dodge the contrast
 * spec's pairing. `contrast.spec.ts` also asserts every override actually
 * differs from its category default, so a stale entry cannot linger.
 */
export const NODE_KIND_COLOR_OVERRIDES: Partial<Record<NodeKind, { bg: string; fg: string }>> = {};

const kindPair = (kind: NodeKind): { bg: string; fg: string } =>
  NODE_KIND_COLOR_OVERRIDES[kind] ?? CATEGORY_COLORS[NODE_KIND_CATEGORY[kind]];

/** Derived, not authored: every kind wears its category's pair unless overridden. */
const nodeKind = Object.fromEntries(NODE_KINDS.map((kind) => [kind, kindPair(kind).bg])) as Record<
  NodeKind,
  string
>;

const nodeKindFg = Object.fromEntries(
  NODE_KINDS.map((kind) => [kind, kindPair(kind).fg]),
) as Record<NodeKind, string>;

const nodeKindCategory = Object.fromEntries(
  Object.entries(CATEGORY_COLORS).map(([id, pair]) => [id, pair.bg]),
) as Record<NodeKindCategoryId, string>;

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
    },

    text: {
      primary: neutral.textPrimary,
      secondary: neutral.textSecondary,
      muted: neutral.textMuted,
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
    nodeKindCategory: { ...nodeKindCategory },
    chart: { series: [...CHART_SERIES[mode]] },
  };
}
