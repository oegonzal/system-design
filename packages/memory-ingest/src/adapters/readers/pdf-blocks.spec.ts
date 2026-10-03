import { describe, expect, it } from 'vitest';

import {
  BLOCK_GAP,
  blocksOf,
  FONT_STEP,
  linesOf,
  pageText,
  type PositionedText,
} from './pdf-blocks';

const item = (text: string, x: number, y: number, height = 10, font = 'body'): PositionedText => ({
  text,
  x,
  y,
  height,
  font,
});

/** A résumé's shape: a heading in larger type, an employer line, then two wrapped bullets one pitch apart. */
function resumePage(): PositionedText[] {
  const pitch = 12;
  let y = 700;
  const next = (gap = pitch): number => (y -= gap);
  return [
    item('EXPERIENCE', 40, y, 14, 'bold'),
    item('ACME | Lead Engineer', 40, next(pitch + 8), 10, 'bold'),
    item('Jun 2024 – Feb 2026 | Remote', 40, next(), 10),
    item('• Built the thing with', 40, next(pitch + 8)),
    item('TypeScript and NestJS,', 160, y), // the same baseline: one line with the run before it
    item('scaling it to 10,000 users.', 40, next()),
    item('• Led the other thing', 40, next()),
    item('across two teams.', 40, next()),
    item('NEXT CO | Engineer', 40, next(pitch + 8), 10, 'bold'),
  ];
}

describe('pdf blocks', () => {
  it('[ING-2] groups items into lines by baseline, left to right, and reads the page top down', () => {
    const lines = linesOf(resumePage());
    expect(lines.map((line) => line.text)).toEqual([
      'EXPERIENCE',
      'ACME | Lead Engineer',
      'Jun 2024 – Feb 2026 | Remote',
      '• Built the thing with TypeScript and NestJS,',
      'scaling it to 10,000 users.',
      '• Led the other thing',
      'across two teams.',
      'NEXT CO | Engineer',
    ]);
    expect(linesOf([item('b', 50, 10), item('a', 10, 10), item(' ', 0, 10)])[0]?.text).toBe('a b');
  });

  it('[ING-2] opens a block after a gap larger than the page’s own pitch or a change of type size, so a heading never joins the paragraph before it', () => {
    const blocks = blocksOf(linesOf(resumePage())).map((block) => block.map((line) => line.text));
    expect(blocks).toEqual([
      ['EXPERIENCE'],
      ['ACME | Lead Engineer', 'Jun 2024 – Feb 2026 | Remote'],
      [
        '• Built the thing with TypeScript and NestJS,',
        'scaling it to 10,000 users.',
        '• Led the other thing',
        'across two teams.',
      ],
      ['NEXT CO | Engineer'],
    ]);
    expect(BLOCK_GAP).toBeGreaterThan(1);
    expect(FONT_STEP).toBeLessThan(0.5);
  });

  it('[ING-2] follows the reading order the engine emits, so a second column is its own blocks and never woven into the first', () => {
    const left = resumePage();
    // The right column starts back at the top of the page, beside the first column's lines.
    const right = [
      item('EDUCATION', 320, 700, 14, 'bold'),
      item('UC SAN DIEGO', 320, 680, 10, 'bold'),
      item('BS Computer Science', 320, 668),
      item('2016 | San Diego, CA', 320, 656),
    ];
    const blocks = blocksOf(linesOf([...left, ...right])).map((block) =>
      block.map((line) => line.text),
    );
    expect(blocks.slice(-2)).toEqual([
      ['EDUCATION'],
      ['UC SAN DIEGO', 'BS Computer Science', '2016 | San Diego, CA'],
    ]);
    // Nothing from the right column landed on a left-column line.
    for (const block of blocks.slice(0, -2)) {
      for (const line of block) expect(line).not.toMatch(/EDUCATION|SAN DIEGO/);
    }
  });

  it('[ING-2] renders blocks apart by a blank line and lines within a block on their own lines — what the chunker reads as paragraphs and items', () => {
    const text = pageText(resumePage());
    expect(text.split('\n\n')).toHaveLength(4);
    expect(text).toContain(
      'ACME | Lead Engineer\nJun 2024 – Feb 2026 | Remote\n\n• Built the thing',
    );
    expect(pageText([])).toBe('');
    // One line alone has no pitch to measure against; it is one block.
    expect(pageText([item('only', 0, 0)])).toBe('only');
  });
});
