import { createHash } from 'node:crypto';

import {
  DOCUMENT_CONTEXT_MAX_LENGTH,
  DOCUMENT_MAX_MEMORIES,
  DOCUMENT_PART_MAX_LENGTH,
  DOCUMENT_RULES,
  documentChunkSchema,
  GoalBudgetExceeded,
  renderDocumentGoal,
  textBytes,
  type DocumentChunk,
  type DocumentKind,
} from '@sysdesign/contracts';

import type { PlannedChunk } from './ports';

/**
 * A document, chunked for the loop. Structure first: a heading line, a list
 * item (with the lines that continue it) and a blank-line paragraph each
 * become one part, a part past the contract's cap is split at the last
 * whitespace before it, and parts are packed greedily into chunks whose
 * rendered goal stays under the budget. Nothing is repeated between chunks —
 * the store cannot dedupe a near-duplicate fact — so continuity comes from
 * `context`, the headings enclosing the chunk's first part. Pure: the same
 * text yields the same chunks and the same hashes.
 */
export interface ChunkingInput {
  text: string;
  kind: DocumentKind;
  title: string;
  subject: string;
  /** The day the document speaks for, when something says. */
  date: string | null;
  /** The most a rendered goal may weigh, in UTF-8 bytes. */
  chunkBytes: number;
}

export interface ChunkPlan {
  /** Parts after splitting — what the chunks were packed from. */
  parts: number;
  chunks: PlannedChunk[];
}

/**
 * How many parts one chunk may carry. Measured on the first live digests
 * (2026-10-03): a résumé's 18 bullet parts yielded 21 fact criteria against
 * the contract's 16 memories, so coverage could never pass; and 10 dense
 * skills parts wanted 14 memories against a cap tied to the part count, so
 * the producer was blocked. The memory cap therefore stays the contract's,
 * and a chunk carries at most this many parts, so two facts per part fit.
 */
export const PARTS_PER_CHUNK = 8;

/** A part that cannot be made to fit: a lone section already renders past the budget. */
export class ChunkBudgetExceeded extends Error {
  override readonly name = 'ChunkBudgetExceeded';
  constructor(
    readonly part: number,
    readonly bytes: number,
    readonly budget: number,
  ) {
    super(
      `part ${part} alone renders to ${bytes} bytes, past --chunk-bytes ${budget}; raise the budget`,
    );
  }
}

/** The headings on the way down to a part, outermost first. */
export const CONTEXT_SEPARATOR = ' > ';

/** A structural unit of the document with the headings that enclose it. */
interface Part {
  text: string;
  path: readonly string[];
}

type LineRead =
  | { kind: 'blank' }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'item' }
  | { kind: 'text' };

/**
 * The block starts the splitter knows — CommonMark's ATX heading (up to three
 * spaces of indent) and list item, plus the bullet glyphs a PDF's text layer
 * carries where markdown would have a marker. A dash that is not a markdown
 * marker opens nothing: it is prose. Anything else is text, which continues
 * an open item or paragraph (CommonMark's lazy continuation) or opens one.
 */
const HEADING = /^ {0,3}(#{1,6})\s+(\S.*?)\s*#*\s*$/;
const ITEM = /^\s*(?:[-*+•◦▪]|\d+[.)])\s+\S/;

const readLine = (line: string): LineRead => {
  if (line.trim() === '') return { kind: 'blank' };
  const heading = HEADING.exec(line);
  if (heading) return { kind: 'heading', level: heading[1]?.length ?? 1, text: heading[2] ?? '' };
  if (ITEM.test(line)) return { kind: 'item' };
  return { kind: 'text' };
};

/** A PDF's pages arrive joined by form feeds; a page break is a paragraph break. */
const normalize = (text: string): string[] =>
  text.replace(/\r\n?/g, '\n').replace(/\f/g, '\n\n').split('\n');

function partsOf(text: string): Part[] {
  const path: string[] = [];
  const parts: Part[] = [];
  let open: { lines: string[]; path: readonly string[] } | null = null;
  const close = (): void => {
    if (open !== null) parts.push({ text: open.lines.join('\n'), path: open.path });
    open = null;
  };
  for (const line of normalize(text)) {
    const read = readLine(line);
    if (read.kind === 'blank') {
      close();
    } else if (read.kind === 'heading') {
      close();
      // A heading is a part under its ancestors; what follows is under it too.
      path.splice(read.level - 1);
      parts.push({ text: line.trim(), path: [...path] });
      path.push(read.text);
    } else if (read.kind === 'item') {
      close();
      open = { lines: [line.trim()], path: [...path] };
    } else if (open !== null) {
      open.lines.push(line.trim());
    } else {
      open = { lines: [line.trim()], path: [...path] };
    }
  }
  close();
  return parts.flatMap(splitOversize);
}

/** Pieces no longer than the cap, cut at the last whitespace before it; a run with none is cut at the cap. */
function splitOversize(part: Part): Part[] {
  if (part.text.length <= DOCUMENT_PART_MAX_LENGTH) return [part];
  const pieces: Part[] = [];
  let rest = part.text;
  while (rest.length > DOCUMENT_PART_MAX_LENGTH) {
    // One past the cap, so whitespace sitting exactly at the cap is a legal cut.
    const window = rest.slice(0, DOCUMENT_PART_MAX_LENGTH + 1);
    const at = window.search(/\s\S*$/);
    const cut = at > 0 ? at : DOCUMENT_PART_MAX_LENGTH;
    pieces.push({ text: rest.slice(0, cut).trimEnd(), path: part.path });
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) pieces.push({ text: rest, path: part.path });
  return pieces;
}

/** The enclosing headings as one line under the contract's cap; the outermost go first when it will not fit. */
export function contextOf(path: readonly string[]): string | null {
  if (path.length === 0) return null;
  let kept = path;
  while (kept.length > 1 && kept.join(CONTEXT_SEPARATOR).length > DOCUMENT_CONTEXT_MAX_LENGTH) {
    kept = kept.slice(1);
  }
  return kept.join(CONTEXT_SEPARATOR).slice(0, DOCUMENT_CONTEXT_MAX_LENGTH);
}

/** sha256 hex of the goal a chunk renders to: its identity wherever it is recorded. */
export const chunkHash = (goal: string): string =>
  createHash('sha256').update(goal, 'utf8').digest('hex');

const chunkOf = (
  group: readonly Part[],
  index: number,
  of: number,
  input: ChunkingInput,
): DocumentChunk => ({
  kind: input.kind,
  title: input.title,
  subject: input.subject,
  date: input.date,
  chunk: { index, of },
  context: contextOf(group[0]?.path ?? []),
  parts: group.map((part) => part.text),
  rules: [...DOCUMENT_RULES],
  // The contract's cap, not the part count: a dense part states several facts.
  maxMemories: DOCUMENT_MAX_MEMORIES,
});

/**
 * What a group would weigh. `of` is not known until packing ends, so the
 * measure uses the part count for both positions — no chunk number can have
 * more digits — and a render the engine itself would refuse weighs infinity.
 */
function measure(group: readonly Part[], input: ChunkingInput, total: number): number {
  try {
    return textBytes(renderDocumentGoal(chunkOf(group, total, total, input)));
  } catch (error) {
    if (error instanceof GoalBudgetExceeded) return Number.POSITIVE_INFINITY;
    throw error;
  }
}

function pack(parts: readonly Part[], input: ChunkingInput): Part[][] {
  const groups: Part[][] = [];
  let current: Part[] = [];
  parts.forEach((part, position) => {
    const candidate = [...current, part];
    const fits =
      candidate.length <= PARTS_PER_CHUNK &&
      measure(candidate, input, parts.length) <= input.chunkBytes;
    if (fits) {
      current = candidate;
      return;
    }
    if (current.length > 0) groups.push(current);
    current = [part];
    const alone = measure(current, input, parts.length);
    if (alone > input.chunkBytes) {
      throw new ChunkBudgetExceeded(position + 1, alone, input.chunkBytes);
    }
  });
  if (current.length > 0) groups.push(current);
  return groups;
}

/** The chunks a document packs into, each already parsed by the contract so nothing unfit is ever posted. */
export function chunkDocument(input: ChunkingInput): ChunkPlan {
  const parts = partsOf(input.text);
  const groups = pack(parts, input);
  const chunks = groups.map((group, position) => {
    const chunk = documentChunkSchema.parse(chunkOf(group, position + 1, groups.length, input));
    const goal = renderDocumentGoal(chunk);
    return { chunk, goal, chunkHash: chunkHash(goal), bytes: textBytes(goal) };
  });
  return { parts: parts.length, chunks };
}
