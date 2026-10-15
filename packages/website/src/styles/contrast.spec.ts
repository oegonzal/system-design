import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/** The colour tokens the stylesheet's @theme block declares, by name. */
const THEME = /@theme\s*\{([^}]*)\}/.exec(
  readFileSync(new URL('./global.css', import.meta.url), 'utf8'),
);
const COLORS = new Map(
  [...(THEME?.[1] ?? '').matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g)].map(([, name, hex]) => [
    name,
    hex,
  ]),
);

/** WCAG 2.2 minimums: text (SC 1.4.3), and a focus outline or an edge that carries meaning (SC 1.4.11). */
const TEXT = 4.5;
const EDGE = 3;

/**
 * Every pairing a component may draw, as [foreground, background, minimum]:
 * the palette's contract. Teal (`accent`) is a rule, rail or dot on a light
 * surface and never text there, since on a muted band it reads at the AA
 * line and on a panel below it: as text it is `accent-strong` on a light
 * surface and `accent-bright` on a band. A text pairing also serves as an
 * outline on that surface.
 */
const PAIRINGS: [string, string, number][] = [
  ['ink', 'surface', TEXT],
  ['ink', 'surface-muted', TEXT],
  ['ink', 'surface-tint', TEXT],
  ['ink-soft', 'surface', TEXT],
  ['ink-soft', 'surface-muted', TEXT],
  ['ink-soft', 'surface-tint', TEXT],
  ['link', 'surface', TEXT],
  ['link', 'surface-muted', TEXT],
  ['link', 'surface-tint', TEXT],
  ['accent-strong', 'surface', TEXT],
  ['accent-strong', 'surface-muted', TEXT],
  ['accent-strong', 'surface-tint', TEXT],
  ['on-brand', 'brand', TEXT],
  ['on-brand', 'brand-strong', TEXT],
  ['on-brand-soft', 'brand', TEXT],
  ['on-brand-soft', 'brand-strong', TEXT],
  ['accent-bright', 'brand', TEXT],
  ['accent-bright', 'brand-strong', TEXT],
  ['on-brand', 'accent', TEXT],
  ['brand', 'accent-bright', TEXT],
  // Rules, rails and dots that carry meaning on a light surface.
  ['accent', 'surface', EDGE],
  ['accent', 'surface-muted', EDGE],
  ['accent', 'surface-tint', EDGE],
];

/** Tokens drawn only as decoration (a hairline beside text), never as the one cue. */
const DECORATIVE = ['line'];

const token = (name: string): string => {
  const hex = COLORS.get(name);
  if (hex === undefined) throw new Error(`global.css declares no --color-${name}.`);
  return hex;
};

/** Relative luminance of a #rrggbb colour, per WCAG. */
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};

const contrast = (foreground: string, background: string): number => {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

describe('palette', () => {
  it.each(PAIRINGS)('%s on %s reads at %s:1 or better', (foreground, background, minimum) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(minimum);
  });

  it('names every colour token in a pairing or as decoration, so a new token is checked before it is drawn', () => {
    const named = new Set([...PAIRINGS.flatMap(([fg, bg]) => [fg, bg]), ...DECORATIVE]);

    expect([...COLORS.keys()].filter((name) => !named.has(name))).toEqual([]);
    expect(DECORATIVE.filter((name) => !COLORS.has(name))).toEqual([]);
  });

  it('would refuse teal as text on a panel, which is why accent-strong exists', () => {
    expect(contrast(token('accent'), token('surface-tint'))).toBeLessThan(TEXT);
    expect(contrast(token('accent'), token('surface-muted'))).toBeLessThan(TEXT + 0.01);
    expect(contrast(token('accent-strong'), token('surface-tint'))).toBeGreaterThanOrEqual(TEXT);
  });
});
