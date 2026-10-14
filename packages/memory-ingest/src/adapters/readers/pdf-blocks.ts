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

/**
 * Items whose baselines differ by less than this share of the SMALLER of
 * their heights are one line. The smaller, because a résumé's 40-point name
 * sits sixteen points above its 11-point contact line: measured against the
 * name, that gap reads as the same line and the two run together.
 */
export const LINE_TOLERANCE = 0.5;
/** A gap between consecutive lines larger than this multiple of the page's median pitch opens a block. */
export const BLOCK_GAP = 1.5;
/** A line whose type size differs from the line before by more than this share opens a block. */
export const FONT_STEP = 0.15;
/**
 * A line set at least this much larger than the page's body text is a
 * heading. Measured on a résumé whose employer names are set at 12 points
 * against 9-point bullets and 10-point dates: the step has to clear the
 * body's own variation and catch the employer line, because a chunk that
 * begins mid-section is told which section it is in by nothing else — the
 * first live ingest attributed one employer's achievements to the next
 * employer for exactly that reason.
 */
export const HEADING_RATIO = 1.15;
/** The deepest heading markdown has; a page with more sizes than this flattens into it. */
export const MAX_HEADING_LEVEL = 6;

/** The size the page's text is mostly set at: the one the most lines share, ties to the smaller. */
export function bodyHeight(lines: readonly PdfLine[]): number {
  const counts = new Map<number, number>();
  for (const line of lines) {
    const size = Math.round(line.height * 2) / 2;
    counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  let body = 0;
  let most = 0;
  for (const [size, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > most) {
      most = count;
      body = size;
    }
  }
  return body;
}

/**
 * What heading level each size on the page means: the sizes above the body
 * text, largest first, so the biggest line is level one. A page whose text is
 * all one size has no headings.
 */
export function headingLevels(lines: readonly PdfLine[]): Map<number, number> {
  const body = bodyHeight(lines);
  const sizes = [
    ...new Set(
      lines
        .map((line) => Math.round(line.height * 2) / 2)
        .filter((size) => body > 0 && size >= body * HEADING_RATIO),
    ),
  ].sort((a, b) => b - a);
  return new Map(sizes.map((size, index) => [size, Math.min(index + 1, MAX_HEADING_LEVEL)]));
}

/** The middle value of an odd count, the mean of the two middle values of an even one; nothing has a median of 0. */
const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const middles =
    sorted.length % 2 === 1
      ? sorted.slice(middle, middle + 1)
      : sorted.slice(middle - 1, middle + 1);
  return middles.length === 0 ? 0 : middles.reduce((sum, value) => sum + value, 0) / middles.length;
};

/** Items grouped into lines in reading order: an item on the current line's baseline joins it, any other starts the next. */
export function linesOf(items: readonly PositionedText[]): PdfLine[] {
  const kept = items.filter((item) => item.text.trim().length > 0);
  const lines: { items: PositionedText[]; y: number; height: number }[] = [];
  for (const item of kept) {
    const last = lines[lines.length - 1];
    const tolerance =
      LINE_TOLERANCE * Math.max(Math.min(item.height, last?.height ?? item.height), 1);
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
  const [first, ...rest] = lines;
  if (first === undefined) return [];
  /** Each line beside the one before it, in reading order. */
  const steps: { previous: PdfLine; line: PdfLine }[] = [];
  let previous = first;
  for (const line of rest) {
    steps.push({ previous, line });
    previous = line;
  }
  const pitch = median(
    steps.map(({ previous, line }) => previous.y - line.y).filter((gap) => gap > 0),
  );
  const blocks: PdfLine[][] = [];
  let block: PdfLine[] = [first];
  for (const { previous, line } of steps) {
    const gap = previous.y - line.y;
    const upward = gap < 0;
    const sizeStep =
      Math.abs(line.height - previous.height) / Math.max(previous.height, line.height, 1);
    const opens = upward || (pitch > 0 && gap > BLOCK_GAP * pitch) || sizeStep > FONT_STEP;
    if (opens) {
      blocks.push(block);
      block = [line];
    } else {
      block.push(line);
    }
  }
  blocks.push(block);
  return blocks;
}

/**
 * A page as the chunker reads it: lines within a block on their own lines,
 * blocks apart by a blank line, and a line the typography sets above the body
 * text written as the markdown heading it is — which is how the chunker comes
 * to carry "EXPERIENCE > TICKETSOCKET" as the context of a chunk that begins
 * among that employer's bullets.
 */
export function pageText(items: readonly PositionedText[]): string {
  const lines = linesOf(items);
  const levels = headingLevels(lines);
  const render = (line: PdfLine): string => {
    const level = levels.get(Math.round(line.height * 2) / 2);
    // A line that already opens with #s is left alone rather than given more.
    return level === undefined || line.text.startsWith('#')
      ? line.text
      : `${'#'.repeat(level)} ${line.text}`;
  };
  return blocksOf(lines)
    .map((block) => block.map(render).join('\n'))
    .join('\n\n');
}
