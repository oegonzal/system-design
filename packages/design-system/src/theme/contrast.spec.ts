import {
  ACCENTS,
  COLOR_MODES,
  DEFAULT_APPEARANCE_SETTINGS,
  NODE_KINDS,
  NODE_KIND_CATEGORIES,
  NODE_KIND_CATEGORY,
  SEVERITIES,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { ACCENT_RAMPS } from './accents';
import { WCAG_AA_NON_TEXT, WCAG_AA_TEXT, contrastRatio, formatRatio } from './contrast';
import { CATEGORY_COLORS, NODE_KIND_COLOR_OVERRIDES, type SemanticColors } from './semantic';
import { createTheme } from './theme';

/**
 * The WCAG matrix, generated from the contract tuples rather than written
 * out.
 *
 * That is the "one definition" rule extended into the test suite: adding an
 * accent to `ACCENTS`, a severity to `SEVERITIES` or a kind to `NODE_KINDS`
 * produces new assertions here with no edit to this file, and the build stays
 * red until the colours are authored to clear them.
 *
 * This complements Storybook's a11y addon rather than replacing it. The addon
 * catches *rendered* combinations the token layer never anticipated — muted
 * text on a card that also carries an accent border. This catches the
 * *matrix*, in CI, without a browser.
 *
 * There is no large-text exemption in this system: 3:1 for text requires 24px
 * regular or 18.66px bold, and the largest role is `font.size.xxl` at 24px
 * used only for page headings, so holding every text pair to 4.5:1 removes a
 * judgement call rather than costing anything.
 */

type ColorPath = readonly [keyof SemanticColors, string];

const read = (color: SemanticColors, [group, key]: ColorPath): string => {
  const values = color[group] as Record<string, string>;
  const value = values[key];
  if (typeof value !== 'string') throw new Error(`no such colour role: ${group}.${key}`);
  return value;
};

const label = ([group, key]: ColorPath) => `${group}.${key}`;

/** Foreground / background pairs that carry text. */
const TEXT_PAIRS: readonly (readonly [ColorPath, ColorPath])[] = [
  [
    ['text', 'primary'],
    ['bg', 'app'],
  ],
  [
    ['text', 'primary'],
    ['bg', 'surface'],
  ],
  [
    ['text', 'primary'],
    ['bg', 'subtle'],
  ],
  [
    ['text', 'primary'],
    ['bg', 'selected'],
  ],
  [
    ['text', 'secondary'],
    ['bg', 'app'],
  ],
  [
    ['text', 'secondary'],
    ['bg', 'surface'],
  ],
  [
    ['text', 'secondary'],
    ['bg', 'subtle'],
  ],
  [
    ['text', 'muted'],
    ['bg', 'app'],
  ],
  [
    ['text', 'muted'],
    ['bg', 'surface'],
  ],
  [
    ['text', 'muted'],
    ['bg', 'subtle'],
  ],
  // The tightest cell in the whole matrix: muted text on every accent's tint.
  [
    ['text', 'muted'],
    ['bg', 'selected'],
  ],
  [
    ['text', 'onSelected'],
    ['bg', 'selected'],
  ],
  [
    ['accent', 'fg'],
    ['accent', 'default'],
  ],
  [
    ['accent', 'fg'],
    ['accent', 'hover'],
  ],
  [
    ['danger', 'fg'],
    ['danger', 'bg'],
  ],
  [
    ['success', 'fg'],
    ['success', 'bg'],
  ],
  [
    ['warn', 'fg'],
    ['warn', 'bg'],
  ],
  [
    ['info', 'fg'],
    ['info', 'bg'],
  ],
];

/** WCAG 1.4.11 — component boundaries and other non-text affordances. */
const UI_PAIRS: readonly (readonly [ColorPath, ColorPath])[] = [
  // A link's accent underline and a nav item's current mark, on every surface it sits on.
  [
    ['accent', 'default'],
    ['bg', 'surface'],
  ],
  [
    ['accent', 'default'],
    ['bg', 'app'],
  ],
  [
    ['border', 'default'],
    ['bg', 'surface'],
  ],
  [
    ['border', 'default'],
    ['bg', 'app'],
  ],
  [
    ['border', 'default'],
    ['bg', 'subtle'],
  ],
  [
    ['border', 'accent'],
    ['bg', 'surface'],
  ],
  [
    ['border', 'accent'],
    ['bg', 'app'],
  ],
  [
    ['border', 'focus'],
    ['bg', 'surface'],
  ],
  [
    ['border', 'focus'],
    ['bg', 'app'],
  ],
  [
    ['accent', 'default'],
    ['bg', 'surface'],
  ],
  [
    ['accent', 'default'],
    ['bg', 'app'],
  ],
];

/*
 * Deliberately absent, each for a reason from the spec rather than
 * convenience:
 *
 * - `border.subtle` is a decorative hairline, exempt under 1.4.11. Holding it
 *   to 3:1 would force it to stop being subtle.
 * - `accent.disabled` sits on an inactive component, exempt under both 1.4.3
 *   and 1.4.11. It is asserted only to differ from `accent.default`, so that
 *   "disabled" stays distinguishable.
 * - `border.focus` against `accent.default` is 1.00:1 by construction — both
 *   are the accent ramp's solid. The focus ring clears contrast only because
 *   `theme/global.ts` gives it `outline-offset: 2px`, placing it on the page
 *   background.
 */

describe.each(COLOR_MODES)('%s mode', (colorMode) => {
  describe.each(ACCENTS)('%s accent', (accent) => {
    const { color } = createTheme({ ...DEFAULT_APPEARANCE_SETTINGS, colorMode, accent });

    it.each(TEXT_PAIRS)(`%s on %s clears ${WCAG_AA_TEXT}:1`, (fg, bg) => {
      const ratio = contrastRatio(read(color, fg), read(color, bg));
      expect(ratio, `${label(fg)} on ${label(bg)} is ${formatRatio(ratio)}`).toBeGreaterThanOrEqual(
        WCAG_AA_TEXT,
      );
    });

    it.each(UI_PAIRS)(`%s against %s clears ${WCAG_AA_NON_TEXT}:1`, (fg, bg) => {
      const ratio = contrastRatio(read(color, fg), read(color, bg));
      expect(
        ratio,
        `${label(fg)} against ${label(bg)} is ${formatRatio(ratio)}`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
    });

    it.each(SEVERITIES)(`the %s severity pair clears ${WCAG_AA_TEXT}:1`, (severity) => {
      const pair = color.severity[severity];
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(ratio, `severity.${severity} is ${formatRatio(ratio)}`).toBeGreaterThanOrEqual(
        WCAG_AA_TEXT,
      );
    });

    it.each(NODE_KINDS)(`the %s node chip clears ${WCAG_AA_TEXT}:1`, (kind) => {
      const ratio = contrastRatio(color.nodeKindFg[kind], color.nodeKind[kind]);
      expect(ratio, `nodeKind.${kind} is ${formatRatio(ratio)}`).toBeGreaterThanOrEqual(
        WCAG_AA_TEXT,
      );
    });

    // Every category anchor with its authored foreground — the direct check
    // on the authored table, and cover for any category declared ahead of its
    // kinds, which the per-kind loop cannot reach.
    it.each(NODE_KIND_CATEGORIES)(`the $id category pair clears ${WCAG_AA_TEXT}:1`, ({ id }) => {
      const ratio = contrastRatio(CATEGORY_COLORS[id].fg, color.nodeKindCategory[id]);
      expect(ratio, `nodeKindCategory.${id} is ${formatRatio(ratio)}`).toBeGreaterThanOrEqual(
        WCAG_AA_TEXT,
      );
    });

    it('keeps a disabled control distinguishable from an enabled one', () => {
      expect(color.accent.disabled).not.toBe(color.accent.default);
    });
  });
});

describe('the accent table', () => {
  const RAMP_KEYS = ['solid', 'solidHover', 'onSolid', 'tint', 'onTint', 'ring'] as const;

  it('has an entry for every accent in the contract, and no extras', () => {
    expect(Object.keys(ACCENT_RAMPS).sort()).toEqual([...ACCENTS].sort());
  });

  // Catches a `satisfies` bypassed by a cast, which would otherwise surface
  // as `undefined` interpolated into a CSS declaration.
  it.each(ACCENTS)('gives %s a complete six-value ramp in both modes', (accent) => {
    for (const mode of COLOR_MODES) {
      const ramp = ACCENT_RAMPS[accent][mode] as Record<string, string>;
      expect(Object.keys(ramp).sort()).toEqual([...RAMP_KEYS].sort());
      for (const key of RAMP_KEYS) expect(ramp[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('the node-kind table', () => {
  const { color } = createTheme(DEFAULT_APPEARANCE_SETTINGS);

  it('covers every kind in the contract, and no extras', () => {
    expect(Object.keys(color.nodeKind).sort()).toEqual([...NODE_KINDS].sort());
    expect(Object.keys(color.nodeKindFg).sort()).toEqual([...NODE_KINDS].sort());
  });

  it('covers every category in the contract, and no extras', () => {
    const declared = NODE_KIND_CATEGORIES.map((category) => category.id);
    expect(Object.keys(color.nodeKindCategory).sort()).toEqual([...declared].sort());
  });

  it('is mode-independent — domain colour, not theme colour', () => {
    const dark = createTheme({ ...DEFAULT_APPEARANCE_SETTINGS, colorMode: 'dark' }).color;
    expect(dark.nodeKind).toEqual(color.nodeKind);
    expect(dark.nodeKindFg).toEqual(color.nodeKindFg);
    expect(dark.nodeKindCategory).toEqual(color.nodeKindCategory);
  });

  // Trivially green while the override table is empty — that is the point:
  // the day an override lands, it must be a real departure from the category
  // pair it shadows, or it is dead weight to delete.
  it('keeps every colour override a genuine departure from its category default', () => {
    for (const [kind, pair] of Object.entries(NODE_KIND_COLOR_OVERRIDES)) {
      const fallback = CATEGORY_COLORS[NODE_KIND_CATEGORY[kind as (typeof NODE_KINDS)[number]]];
      expect(pair, `override for ${kind} restates its category default`).not.toEqual(fallback);
    }
  });
});
