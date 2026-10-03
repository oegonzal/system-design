/**
 * The grammar of Playwright's `ariaSnapshot({ mode: 'ai' })`, read back. One
 * node per line, indented two spaces per level: a role, an optional quoted
 * name, bracketed attributes — among them the `[ref=eN]` Playwright minted,
 * which `aria-ref=eN` resolves — and a trailing colon when children or
 * inline text follow. Property lines (`- /url: …`) and text lines
 * (`- text: …`) are not nodes.
 * Nothing here touches a page; the spec runs over fixture text.
 */
export interface SnapshotNode {
  depth: number;
  role: string;
  name: string | null;
  /** `e12`, when Playwright minted one for the node. */
  ref: string | null;
  /** `[disabled]` → `disabled: true`; `[level=2]` → `level: '2'`. */
  attributes: Record<string, string | true>;
}

const NODE_LINE =
  /^(?<indent> *)- (?<role>[a-z][\w-]*)(?: "(?<name>(?:[^"\\]|\\.)*)")?(?<attrs>(?: \[[^\]]*\])*)\s*(?::\s*(?<inline>.*))?$/;
/** The one pseudo-role: a `- text: …` line is a text node, not an element. */
const TEXT_ROLE = 'text';
const ATTRIBUTE = /\[([^\]=]+)(?:=([^\]]*))?\]/g;
const REF = /^e\d+$/;

/** A quoted name with its escapes undone. */
const unescape = (name: string): string => name.replace(/\\(.)/g, '$1');

function attributesOf(text: string): Record<string, string | true> {
  const attributes: Record<string, string | true> = {};
  for (const match of text.matchAll(ATTRIBUTE)) {
    const [, key, value] = match;
    if (key !== undefined) attributes[key] = value === undefined ? true : value;
  }
  return attributes;
}

/** Every node line, in document order; lines that are not nodes are skipped. */
export function decodeAriaSnapshot(snapshot: string): SnapshotNode[] {
  const nodes: SnapshotNode[] = [];
  for (const line of snapshot.split('\n')) {
    const match = NODE_LINE.exec(line);
    const groups = match?.groups;
    if (!groups?.['role'] || groups['role'] === TEXT_ROLE) continue;
    const attributes = attributesOf(groups['attrs'] ?? '');
    const ref = attributes['ref'];
    nodes.push({
      depth: (groups['indent'] ?? '').length / 2,
      role: groups['role'],
      name: groups['name'] === undefined ? null : unescape(groups['name']),
      ref: typeof ref === 'string' && REF.test(ref) ? ref : null,
      attributes,
    });
  }
  return nodes;
}

/**
 * How a snapshot too big for its byte budget is reduced: by declared rungs,
 * never a cut mid-page. The whole snapshot; then its nodes alone — property
 * lines, text lines and a node's inline text dropped; then only the nodes
 * Playwright minted refs for; then none. A reduced snapshot opens with a line
 * naming its rung and what it dropped, so the dump and the model both know.
 */
/**
 * Whether a snapshot carries any ref at all. A settled page has at least one,
 * because Playwright mints a ref for all but the plainest node; a read taken
 * while the document is being replaced carries none — which is not the same
 * thing as a page with nothing on it.
 */
export const hasRef = (snapshot: string): boolean => /\[ref=/.test(snapshot);

/** How many times a ref-less read is taken again before the page is reported as it stands. */
export const EMPTY_SNAPSHOT_READS = 4;

/**
 * The first read that carries a ref, or the last read that came back at all.
 *
 * Measured live on 2026-10-03: reading the page in the moment a `press Enter`
 * was navigating returned a 450-line snapshot carrying no refs, and the
 * session told the brain that a full search-results page had no interactive
 * elements. The brain could only guess, was faulted for guessing, and the
 * session died at its failure rail three steps on. A read is retried rather
 * than believed, because the page not being readable yet is a fact about the
 * moment, not about the page.
 *
 * `read` returns null when the document could not be read at all — mid-
 * navigation there is no body to match — and `between` is awaited before each
 * further read. The reader owns waiting for the load state; this owns only
 * how many times a ref-less answer is taken for an answer.
 */
export async function settledSnapshot(
  read: () => Promise<string | null>,
  between: () => Promise<void>,
  reads: number = EMPTY_SNAPSHOT_READS,
): Promise<string> {
  const limit = Math.max(1, reads);
  let last = '';
  for (let taken = 1; taken <= limit; taken += 1) {
    const text = await read();
    if (text !== null && hasRef(text)) return text;
    if (text !== null) last = text;
    if (taken < limit) await between();
  }
  return last;
}

export const SNAPSHOT_RUNGS = ['full', 'nodes-only', 'refs-only', 'none'] as const;
export type SnapshotRung = (typeof SNAPSHOT_RUNGS)[number];

export interface FittedSnapshot {
  text: string;
  rung: SnapshotRung;
}

/** A node line without the inline text after its colon; null for a line that is not a node. */
function nodeOnly(line: string): string | null {
  const groups = NODE_LINE.exec(line)?.groups;
  if (!groups?.['role'] || groups['role'] === TEXT_ROLE) return null;
  const inline = groups['inline'] ?? '';
  return inline === '' ? line : line.slice(0, line.length - inline.length).replace(/:\s*$/, '');
}

const nodeLines = (lines: readonly string[]): string[] =>
  lines.flatMap((line) => {
    const node = nodeOnly(line);
    return node === null ? [] : [node];
  });

/** Each rung below `full`, as what it keeps of the snapshot's lines. */
const REDUCTIONS: Readonly<Record<Exclude<SnapshotRung, 'full'>, (lines: string[]) => string[]>> = {
  'nodes-only': nodeLines,
  'refs-only': (lines) => nodeLines(lines).filter((line) => /\[ref=e\d+\]/.test(line)),
  none: () => [],
};

const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');

/** The snapshot at the first rung that fits the budget. */
export function fitSnapshot(snapshot: string, maxBytes: number): FittedSnapshot {
  if (bytesOf(snapshot) <= maxBytes) return { text: snapshot, rung: 'full' };
  const lines = snapshot.split('\n').filter((line) => line.trim() !== '');
  for (const rung of SNAPSHOT_RUNGS.slice(1) as Exclude<SnapshotRung, 'full'>[]) {
    const kept = REDUCTIONS[rung](lines);
    const note = `[snapshot reduced to ${rung}: ${lines.length - kept.length} of ${lines.length} lines not shown]`;
    const text = [note, ...kept].join('\n');
    if (bytesOf(text) <= maxBytes) return { text, rung };
  }
  // Unreachable: the `none` rung is one short line.
  return { text: '', rung: 'none' };
}
