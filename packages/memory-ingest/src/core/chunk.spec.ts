import { createHash } from 'node:crypto';

import {
  DOCUMENT_MAX_MEMORIES,
  DOCUMENT_MAX_PARTS,
  DOCUMENT_PART_MAX_LENGTH,
  documentChunkSchema,
  textBytes,
} from '@sysdesign/contracts';

import {
  ChunkBudgetExceeded,
  chunkDocument,
  CONTEXT_SEPARATOR,
  contextOf,
  type ChunkingInput,
} from './chunk';

const NOTES = [
  '# Ada Lovelace — notes',
  '',
  '## Work',
  '',
  '### Analytical Engine, 1842–1843',
  "- Translated Menabrea's memoir and added seven notes; Note G describes an algorithm for Bernoulli numbers.",
  '- Worked with Charles Babbage',
  "  on the engine's design.",
  '',
  'Paragraph one about the engine.',
  'Continues on the next line.',
  '',
  '## Skills',
  '1. Mathematics',
  '2. Writing',
].join('\n');

const input = (overrides: Partial<ChunkingInput> = {}): ChunkingInput => ({
  text: NOTES,
  kind: 'notes',
  title: 'notes.md',
  subject: 'Ada Lovelace',
  date: null,
  chunkBytes: 6000,
  ...overrides,
});

const words = (text: string): string[] => text.split(/\s+/).filter((word) => word.length > 0);
const allParts = (text: string, chunkBytes = 6000): string[] =>
  chunkDocument(input({ text, chunkBytes })).chunks.flatMap((planned) => planned.chunk.parts);

/** Paragraphs of distinct words, so a split that dropped or doubled one would show. */
const prose = (count: number, seed: string): string =>
  Array.from({ length: count }, (_, i) => `${seed}${i}`).join(' ');

describe('chunkDocument', () => {
  it('[ING-1] is deterministic: the same text yields the same chunks and the same hashes', () => {
    const first = chunkDocument(input());
    const second = chunkDocument(input());
    expect(second).toEqual(first);
    expect(first.chunks.map((planned) => planned.chunkHash)).toEqual(
      second.chunks.map((planned) => planned.chunkHash),
    );
    const retitled = chunkDocument(input({ title: 'other.md' }));
    expect(retitled.chunks[0]?.chunkHash).not.toBe(first.chunks[0]?.chunkHash);
  });

  it('[ING-1] names a chunk by the sha256 of the goal it renders to', () => {
    for (const planned of chunkDocument(input()).chunks) {
      expect(planned.chunkHash).toBe(
        createHash('sha256').update(planned.goal, 'utf8').digest('hex'),
      );
      expect(planned.bytes).toBe(textBytes(planned.goal));
    }
  });

  it('[ING-1] reads structure first: headings, list items with their continuation lines, and blank-line paragraphs are the parts', () => {
    const { parts, chunks } = chunkDocument(input());
    expect(parts).toBe(9);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunk.parts).toEqual([
      '# Ada Lovelace — notes',
      '## Work',
      '### Analytical Engine, 1842–1843',
      "- Translated Menabrea's memoir and added seven notes; Note G describes an algorithm for Bernoulli numbers.",
      "- Worked with Charles Babbage\non the engine's design.",
      'Paragraph one about the engine.\nContinues on the next line.',
      '## Skills',
      '1. Mathematics',
      '2. Writing',
    ]);
  });

  it('[ING-1] repeats no text between chunks and drops none: the parts together are the document', () => {
    const long = Array.from({ length: 12 }, (_, i) => `- ${prose(150, `w${i}_`)}`).join('\n');
    const text = `# Title\n\n## Section\n\n${long}`;
    const { chunks } = chunkDocument(input({ text, chunkBytes: 4000 }));
    expect(chunks.length).toBeGreaterThan(1);
    expect(words(allParts(text, 4000).join(' '))).toEqual(words(text));
  });

  it('[ING-1] splits a part past the contract cap at the last whitespace before it, and a run without whitespace at the cap', () => {
    const paragraph = prose(700, 'word');
    expect(paragraph.length).toBeGreaterThan(DOCUMENT_PART_MAX_LENGTH * 2);
    const pieces = allParts(paragraph);
    expect(pieces.length).toBeGreaterThan(2);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(DOCUMENT_PART_MAX_LENGTH);
    expect(pieces.join(' ')).toBe(paragraph);

    const run = 'x'.repeat(DOCUMENT_PART_MAX_LENGTH * 2 + 100);
    expect(allParts(run).map((piece) => piece.length)).toEqual([
      DOCUMENT_PART_MAX_LENGTH,
      DOCUMENT_PART_MAX_LENGTH,
      100,
    ]);
  });

  it('[ING-1] packs greedily under --chunk-bytes and the part cap, and every chunk passes the contract', () => {
    const bullets = Array.from({ length: 40 }, (_, i) => `- item ${i}`).join('\n');
    const plan = chunkDocument(input({ text: bullets, chunkBytes: 64_000 }));
    expect(plan.chunks.map((planned) => planned.chunk.parts.length)).toEqual([
      DOCUMENT_MAX_PARTS,
      40 - DOCUMENT_MAX_PARTS,
    ]);

    const heavy = Array.from({ length: 9 }, (_, i) => `- ${prose(160, `p${i}_`)}`).join('\n');
    const budget = 3000;
    const packed = chunkDocument(input({ text: heavy, chunkBytes: budget }));
    expect(packed.chunks.length).toBeGreaterThan(1);
    for (const planned of packed.chunks) {
      expect(planned.bytes).toBeLessThanOrEqual(budget);
      expect(documentChunkSchema.safeParse(planned.chunk).success).toBe(true);
    }
    expect(packed.chunks.map((planned) => planned.chunk.chunk)).toEqual(
      packed.chunks.map((_, i) => ({ index: i + 1, of: packed.chunks.length })),
    );
  });

  it('[ING-1] carries continuity as context — the headings enclosing the chunk’s first part — never as repeated text', () => {
    const bullets = Array.from({ length: 6 }, (_, i) => `- ${prose(170, `b${i}_`)}`).join('\n');
    const text = `# Title\n\n## Section A\n\n### Sub A1\n\n${bullets}`;
    const { chunks } = chunkDocument(input({ text, chunkBytes: 6000 }));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.chunk.context).toBeNull();
    for (const planned of chunks.slice(1)) {
      expect(planned.chunk.context).toBe(['Title', 'Section A', 'Sub A1'].join(CONTEXT_SEPARATOR));
      expect(planned.chunk.parts.some((part) => part.startsWith('#'))).toBe(false);
    }
  });

  it('[ING-1] sets maxMemories to the lesser of the contract cap and the parts in the chunk', () => {
    const few = chunkDocument(input());
    expect(few.chunks[0]?.chunk.maxMemories).toBe(9);
    const many = Array.from({ length: 40 }, (_, i) => `- item ${i}`).join('\n');
    const plan = chunkDocument(input({ text: many, chunkBytes: 64_000 }));
    expect(plan.chunks.map((planned) => planned.chunk.maxMemories)).toEqual([
      DOCUMENT_MAX_MEMORIES,
      8,
    ]);
  });

  it('reads a form feed as a page break, and a heading path deeper than its parent as a child of what is there', () => {
    expect(allParts('Page one line\fPage two line')).toEqual(['Page one line', 'Page two line']);
    expect(allParts('Alpha\r\nBeta\r\n\r\nGamma')).toEqual(['Alpha\nBeta', 'Gamma']);
    // CommonMark: up to three spaces may precede a heading; a dash that is no list marker is prose.
    expect(
      allParts('   ## Indented\nline\n— an aside\n– 2020–2023, as a line\n• glyph item'),
    ).toEqual(['## Indented', 'line\n— an aside\n– 2020–2023, as a line', '• glyph item']);
    const { chunks } = chunkDocument(
      input({
        text: `# Top\n### Deep\n- ${prose(400, 'z')}\n- ${prose(400, 'y')}`,
        chunkBytes: 4000,
      }),
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]?.chunk.context).toBe(`Top${CONTEXT_SEPARATOR}Deep`);
  });

  it('refuses a budget no single part can fit, naming the part', () => {
    expect(() => chunkDocument(input({ chunkBytes: 500 }))).toThrow(ChunkBudgetExceeded);
    expect(() => chunkDocument(input({ chunkBytes: 500 }))).toThrow(
      /part 1 alone renders to \d+ bytes/,
    );
  });

  it('yields no chunks for a document with no text', () => {
    expect(chunkDocument(input({ text: '\n\n  \n' }))).toEqual({ parts: 0, chunks: [] });
  });
});

describe('contextOf', () => {
  it('joins the path outermost first and drops the outermost headings when it would not fit', () => {
    expect(contextOf([])).toBeNull();
    expect(contextOf(['A', 'B'])).toBe(`A${CONTEXT_SEPARATOR}B`);
    const wide = ['x'.repeat(200), 'y'.repeat(150), 'z'.repeat(100)];
    expect(contextOf(wide)).toBe(`${wide[1]}${CONTEXT_SEPARATOR}${wide[2]}`);
    expect(contextOf(['q'.repeat(400)])).toHaveLength(300);
  });
});
