/**
 * A PDF page's text as blocks, from the geometry of its text items. A PDF's
 * text layer carries no blank lines: a wrapped bullet, the employer line
 * above it and the heading above that arrive as one run of lines, and a
 * splitter that reads lines alone glues each heading onto the paragraph
 * before it — measured on the first live résumé digest, where two facts were
 * attributed to the wrong section for exactly that reason. The layout knows
 * where the blocks are: a paragraph's lines sit one pitch apart, a new block
 * opens after a larger gap, a jump back up the page (the next column, or a
 * sidebar) or a change of type size. Gaps are read against the page's own
 * median pitch, never an absolute number, and items are read in the order
 * the engine emits them — the document's reading order — never re-sorted by
 * position, which on a two-column page would weave the columns together.
 */

/** One positioned run of text, as the PDF engine reports it. */
export interface PositionedText {
  text: string;
  x: number;
  /** The baseline, in PDF units; larger is higher on the page. */
  y: number;
  height: number;
  font: string;
}

export interface PdfLine {
  text: string;
  y: number;
  height: number;
  font: string;
}

/** Items whose baselines differ by less than this share of their height are one line. */
export const LINE_TOLERANCE = 0.5;
/** A gap between consecutive lines larger than this multiple of the page's median pitch opens a block. */
export const BLOCK_GAP = 1.5;
/** A line whose type size differs from the line before by more than this share opens a block. */
export const FONT_STEP = 0.15;

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** Items grouped into lines in reading order: an item on the current line's baseline joins it, any other starts the next. */
export function linesOf(items: readonly PositionedText[]): PdfLine[] {
  const kept = items.filter((item) => item.text.trim().length > 0);
  const lines: { items: PositionedText[]; y: number; height: number }[] = [];
  for (const item of kept) {
    const last = lines[lines.length - 1];
    const tolerance = LINE_TOLERANCE * Math.max(item.height, last?.height ?? 0, 1);
    if (last !== undefined && Math.abs(last.y - item.y) <= tolerance) {
      last.items.push(item);
    } else {
      lines.push({ items: [item], y: item.y, height: item.height });
    }
  }
  return lines.map((line) => {
    const ordered = [...line.items].sort((a, b) => a.x - b.x);
    const tallest = ordered.reduce((a, b) => (b.height > a.height ? b : a));
    return {
      text: ordered
        .map((item) => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      y: line.y,
      height: tallest.height,
      font: tallest.font,
    };
  });
}

/**
 * The lines cut into blocks where the layout opened one: a gap wider than
 * the page's pitch allows, a jump back up the page, or a change of type size.
 */
export function blocksOf(lines: readonly PdfLine[]): PdfLine[][] {
  if (lines.length === 0) return [];
  const pitches = lines.slice(1).map((line, index) => lines[index]!.y - line.y);
  const pitch = median(pitches.filter((gap) => gap > 0));
  const blocks: PdfLine[][] = [[lines[0]!]];
  lines.slice(1).forEach((line, index) => {
    const previous = lines[index]!;
    const gap = previous.y - line.y;
    const upward = gap < 0;
    const sizeStep =
      Math.abs(line.height - previous.height) / Math.max(previous.height, line.height, 1);
    const opens = upward || (pitch > 0 && gap > BLOCK_GAP * pitch) || sizeStep > FONT_STEP;
    if (opens) blocks.push([line]);
    else blocks[blocks.length - 1]!.push(line);
  });
  return blocks;
}

/** A page as the chunker reads it: lines within a block on their own lines, blocks apart by a blank line. */
export const pageText = (items: readonly PositionedText[]): string =>
  blocksOf(linesOf(items))
    .map((block) => block.map((line) => line.text).join('\n'))
    .join('\n\n');
