/**
 * WCAG 2.1 contrast maths.
 *
 * Twenty-five lines rather than a dependency: the whole algorithm is two
 * formulae from the spec, and vendoring it keeps the token layer
 * dependency-free.
 *
 * Lives in `theme/` rather than beside the spec because two things read it —
 * `contrast.spec.ts`, and the Colors story, which prints the computed ratio
 * next to each swatch so the catalog documents itself.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` → `[0xaa, 0xbb, 0xcc]`. */
function channels(hex: string): [number, number, number] {
  if (!HEX.test(hex)) {
    // Throwing is the point. A `transparent` or an `rgba()` that reached a
    // colour role would otherwise score a silent, meaningless 21:1 — the
    // failure mode this helper exists to prevent.
    throw new Error(`contrast: expected #rgb or #rrggbb, received ${JSON.stringify(hex)}`);
  }

  const body = hex.slice(1);
  const full = body.length === 3 ? body.replace(/./g, (c) => c + c) : body;

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** sRGB relative luminance — WCAG 2.1, "relative luminance". */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio, 1–21. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker = 0] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.1 §1.4.3 — text below 24px regular / 18.66px bold. */
export const WCAG_AA_TEXT = 4.5;

/** WCAG 2.1 §1.4.11 — UI components and graphical objects. */
export const WCAG_AA_NON_TEXT = 3;

/** Two decimals, for test titles and story labels. */
export const formatRatio = (ratio: number): string => `${ratio.toFixed(2)}:1`;
