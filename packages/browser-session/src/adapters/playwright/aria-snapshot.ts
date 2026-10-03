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
