/**
 * A line-by-line comparison of two rendered artifacts.
 *
 * The rendered artifact is the one field where a whole-value replacement tells
 * a reader nothing: it is the text every judge actually read, and what matters
 * is the three lines that changed in two hundred. A text-diff library would
 * answer this, at the cost of a second dependency and a patch encoding to
 * decode, for this one field. A line-level longest-common-subsequence is forty
 * lines and reads better, so that is what this is.
 *
 * The result is a list of lines, each marked same, added or removed, in reading
 * order — not a patch. Nothing applies it; it is only ever displayed.
 */

export const LINE_KINDS = ['same', 'added', 'removed'] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export interface DiffLine {
  kind: LineKind;
  text: string;
  /** 1-based line number in the old text; null for an added line. */
  before: number | null;
  /** 1-based line number in the new text; null for a removed line. */
  after: number | null;
}

/**
 * Above this many lines on either side the quadratic table is abandoned and the
 * two texts are reported whole. Measured against the longest rendered artifact
 * on record (a few hundred lines), so the bound is headroom rather than a limit
 * a real artifact meets.
 */
export const MAX_LINES = 1500;

const split = (text: string): string[] => (text === '' ? [] : text.split('\n'));

/** The LCS table over two line arrays — lengths only, which is all the walk needs. */
function lengths(left: readonly string[], right: readonly string[]): Uint32Array[] {
  const table: Uint32Array[] = Array.from(
    { length: left.length + 1 },
    () => new Uint32Array(right.length + 1),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

/**
 * The two texts as one annotated reading order. A removal is listed before the
 * addition that replaced it, which is how a reader expects to see a change.
 */
export function lineDiff(before: string | null, after: string | null): DiffLine[] {
  const left = split(before ?? '');
  const right = split(after ?? '');
  if (left.length > MAX_LINES || right.length > MAX_LINES) {
    return [
      ...left.map((text, index) => ({
        kind: 'removed' as const,
        text,
        before: index + 1,
        after: null,
      })),
      ...right.map((text, index) => ({
        kind: 'added' as const,
        text,
        before: null,
        after: index + 1,
      })),
    ];
  }
  const table = lengths(left, right);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push({ kind: 'same', text: left[i], before: i + 1, after: j + 1 });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ kind: 'removed', text: left[i], before: i + 1, after: null });
      i += 1;
    } else {
      lines.push({ kind: 'added', text: right[j], before: null, after: j + 1 });
      j += 1;
    }
  }
  while (i < left.length) {
    lines.push({ kind: 'removed', text: left[i], before: i + 1, after: null });
    i += 1;
  }
  while (j < right.length) {
    lines.push({ kind: 'added', text: right[j], before: null, after: j + 1 });
    j += 1;
  }
  return lines;
}

/** How many lines of each kind — the summary shown beside the text. */
export function countLines(lines: readonly DiffLine[]): Record<LineKind, number> {
  const counts: Record<LineKind, number> = { same: 0, added: 0, removed: 0 };
  for (const line of lines) counts[line.kind] += 1;
  return counts;
}
