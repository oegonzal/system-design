import {
  ELEMENT_REF,
  refOf,
  LANDMARK_ROLES,
  SCOPE_ROLES,
  SNAPSHOT_NODE_LINE,
  SNAPSHOT_RUNGS,
  VALUE_ROLES,
  type ActiveScope,
  type LandmarkRole,
  type ScopeRole,
  type SnapshotRung,
  quotedJson,
  textBytes,
} from '@sysdesign/contracts';

/**
 * The grammar of Playwright's `ariaSnapshot({ mode: 'ai' })`, read back. One
 * node per line, indented two spaces per level: a role, an optional quoted
 * name, bracketed attributes — among them the ref Playwright minted, which
 * `aria-ref=` resolves — and a trailing colon when children or inline text
 * follow; a line YAML wrapped in single quotes is the same node, its name
 * with the doubled quotes undone. A text line (`- text: …`) is a node of the one pseudo-role `text`,
 * carrying what it says as its inline text; a property line (`- /url: …`)
 * is not a node. Nothing here touches a page; the spec runs over fixture text.
 */
export interface SnapshotNode {
  depth: number;
  role: string;
  name: string | null;
  /** `e12`, when Playwright minted one for the node. */
  ref: string | null;
  /** `[disabled]` → `disabled: true`; `[level=2]` → `level: '2'`. */
  attributes: Record<string, string | true>;
  /** The text after the node's colon — a paragraph's words, a text line's content — or null. */
  inline: string | null;
}

const ATTRIBUTE = /\[([^\]=]+)(?:=([^\]]*))?\]/g;

/** A quoted name with its escapes undone — and, on a line YAML wrapped in single quotes, the quotes it doubled. */
const unescape = (name: string, wrapped: boolean): string =>
  (wrapped ? name.replace(/''/g, "'") : name).replace(/\\(.)/g, '$1');

function attributesOf(text: string): Record<string, string | true> {
  const attributes: Record<string, string | true> = {};
  for (const match of text.matchAll(ATTRIBUTE)) {
    const [, key, value] = match;
    if (key !== undefined) attributes[key] = value === undefined ? true : value;
  }
  return attributes;
}

/** Every node line, in document order, text lines included; property lines are skipped. */
export function decodeAriaSnapshot(snapshot: string): SnapshotNode[] {
  const nodes: SnapshotNode[] = [];
  for (const line of snapshot.split('\n')) {
    const groups = SNAPSHOT_NODE_LINE.exec(line)?.groups;
    if (!groups?.['role']) continue;
    const attributes = attributesOf(groups['attrs'] ?? '');
    const ref = attributes['ref'];
    const inline = (groups['inline'] ?? '').trim();
    nodes.push({
      depth: (groups['indent'] ?? '').length / 2,
      role: groups['role'],
      name:
        groups['name'] === undefined
          ? null
          : unescape(groups['name'], groups['quote'] !== undefined),
      ref: typeof ref === 'string' && ELEMENT_REF.test(ref) ? ref : null,
      attributes,
      inline: inline === '' ? null : inline,
    });
  }
  return nodes;
}

const isScopeRole = (role: string): role is ScopeRole =>
  (SCOPE_ROLES as readonly string[]).includes(role);
const isLandmarkRole = (role: string): role is LandmarkRole =>
  (LANDMARK_ROLES as readonly string[]).includes(role);

/** What a node sits in: the nearest dialog, and the nearest top-level landmark, each itself included. */
export interface Ancestry {
  scope: ActiveScope | null;
  landmark: LandmarkRole | null;
}

/**
 * The one walk of a tree's indentation: for each node in document order, the
 * nearest dialog and the nearest landmark it sits in — an ancestor is the
 * last node before it at a smaller depth, and a dialog or a landmark holds
 * itself as well as its descendants, so the node's own ref reads as inside
 * it. `scopesOf`, `landmarksOf` and the scope rung of `fitSnapshot` all read
 * the tree through this and nothing else.
 */
export function ancestryOf(nodes: readonly SnapshotNode[]): Ancestry[] {
  const stack: { depth: number; ancestry: Ancestry }[] = [];
  return nodes.map((node) => {
    while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? 0) >= node.depth) stack.pop();
    const inherited = stack[stack.length - 1]?.ancestry ?? { scope: null, landmark: null };
    const ancestry: Ancestry = {
      scope: isScopeRole(node.role) ? { role: node.role, name: node.name ?? '' } : inherited.scope,
      landmark: isLandmarkRole(node.role) ? node.role : inherited.landmark,
    };
    stack.push({ depth: node.depth, ancestry });
    return ancestry;
  });
}

/** For each node, the nearest dialog it sits in, by role and name — the identity a scope keeps across observations. */
export const scopesOf = (nodes: readonly SnapshotNode[]): (ActiveScope | null)[] =>
  ancestryOf(nodes).map((ancestry) => ancestry.scope);

/** The landmarks the tree lays the page out in, each once, in document order. */
export const landmarkRolesOf = (nodes: readonly SnapshotNode[]): LandmarkRole[] => [
  ...new Set(nodes.map((node) => node.role).filter(isLandmarkRole)),
];

const holdsValue = (role: string): boolean => (VALUE_ROLES as readonly string[]).includes(role);

/**
 * What the tree says inside one landmark: for each node whose nearest landmark
 * it is — the one definition of "inside" the whole engine reads the tree by
 * (`ancestryOf`), so a landmark nested in it is its own, and its words stay
 * with it: a navigation or a complementary overlay laid out inside a main is
 * not the main's statement of anything — in document order, its name and its
 * inline text — a value-holding control's inline text is what it holds and
 * stays out, as in `subtreeText` — one entry per node that has any; none when
 * the tree lays out no such landmark. What a unit of work carries as the
 * page's statement of it (`unitContextOf`), so nothing here reads the words:
 * a node's words are kept as the tree has them.
 */
export function landmarkWords(nodes: readonly SnapshotNode[], landmark: LandmarkRole): string[] {
  const ancestry = ancestryOf(nodes);
  return nodes.flatMap((node, index) => {
    if (ancestry[index]?.landmark !== landmark) return [];
    const words = [
      ...(node.name !== null && node.name !== '' ? [node.name] : []),
      ...(node.inline !== null && !holdsValue(node.role) ? [node.inline] : []),
    ];
    return words.length === 0 ? [] : [words.join(' ')];
  });
}

/**
 * A node's own words and those of every node beneath it, in document order;
 * empty when it has none. The inline text of a control that holds a value is
 * that value, not a word anyone calls it by, and is left out.
 */
export function subtreeText(nodes: readonly SnapshotNode[], index: number): string {
  const root = nodes[index];
  if (root === undefined) return '';
  const words: string[] = [];
  if (root.inline !== null && !holdsValue(root.role)) words.push(root.inline);
  for (let at = index + 1; at < nodes.length; at += 1) {
    const node = nodes[at];
    if (node === undefined || node.depth <= root.depth) break;
    if (node.name !== null && node.name !== '') words.push(node.name);
    if (node.inline !== null && !holdsValue(node.role)) words.push(node.inline);
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * How a snapshot too big for its byte budget is reduced, by declared rungs:
 * the whole snapshot; then the lines that carry words — a name, inline text,
 * a text line — with the wordless node lines and the property lines gone;
 * then those lines with words cut where the room ends, in document order;
 * then none. A reduced snapshot opens with a line naming its rung and what it
 * dropped, so the dump and the model both know.
 *
 * The words are what a snapshot adds to a goal: the elements a plan may act
 * on are listed with their refs whatever the rung, so a line with no words
 * says nothing the Elements list does not. Measured 2026-10-08: the rungs
 * that kept node lines without their words left the 35 KB snapshot of a
 * results page with 308 wordless lines and none of the open listing's text,
 * and every lens read the page as showing no listings.
 */
/**
 * Whether a snapshot carries a node the session can act on: one the grammar
 * reads and Playwright minted a ref for. A substring test for `[ref=` is not
 * enough, because a text whose lines the grammar cannot read yields no node
 * however many refs it mentions — and the session would then see a page with
 * nothing on it. A settled page has at least one such node; a read taken
 * while the document is being replaced has none.
 */
export const carriesRefNode = (snapshot: string): boolean =>
  decodeAriaSnapshot(snapshot).some((node) => node.ref !== null);

/**
 * Non-blank lines the node grammar read nothing from: all of them when a
 * snapshot with lines in it yields no node, and none otherwise.
 *
 * `decodeAriaSnapshot` returning nothing says two different things — the page
 * has nothing on it, or its text could not be read — and until this counted
 * the difference, nothing downstream could tell them apart, and a populated
 * page whose text the grammar could not read was told to the producer as an
 * empty one, with no sign that anything had failed.
 */
export function unreadSnapshotLines(snapshot: string, nodes: readonly SnapshotNode[]): number {
  if (nodes.length > 0) return 0;
  return snapshot.split('\n').filter((line) => line.trim() !== '').length;
}

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
 * further read, `reads` times at most (the observe policy's
 * `emptySnapshotReads`). The reader owns waiting for the load state; this owns
 * only how many times a ref-less answer is taken for an answer.
 */
export async function settledSnapshot(
  read: () => Promise<string | null>,
  between: () => Promise<void>,
  reads: number,
): Promise<string> {
  const limit = Math.max(1, reads);
  let last = '';
  for (let taken = 1; taken <= limit; taken += 1) {
    const text = await read();
    // A page with nothing on it answers with nothing, and is settled at once:
    // only a text that came back saying something the grammar cannot use is
    // worth reading again.
    if (text !== null && (text.trim() === '' || carriesRefNode(text))) return text;
    if (text !== null) last = text;
    if (taken < limit) await between();
  }
  return last;
}

/**
 * The snapshot with every ref the observation does not list taken off its
 * line: such a ref can never be cited — the references validator refuses it —
 * so a goal that shows one offers the planner a token it cannot use. The ref
 * attribute is the snapshot format's own (`[ref=…]`, read by `refOf`); the
 * rest of the line, its words included, stays. Measured 2026-10-08: plans
 * cited `f13e216` and `f13e220`, refs only the snapshot carried, and were cut.
 */
export function withoutUnlistedRefs(snapshot: string, listed: ReadonlySet<string>): string {
  return snapshot
    .split('\n')
    .map((line) => {
      const ref = refOf(line);
      return ref === null || listed.has(ref) ? line : line.replace(` [ref=${ref}]`, '');
    })
    .join('\n');
}

export interface FittedSnapshot {
  text: string;
  rung: SnapshotRung;
}

/** A node line that says something a reader can read: a name, inline text, or a text line's words. */
const carriesWords = (line: string): boolean => {
  const groups = SNAPSHOT_NODE_LINE.exec(line)?.groups;
  return (
    groups?.['role'] !== undefined &&
    ((groups['name'] ?? '') !== '' || (groups['inline'] ?? '').trim() !== '')
  );
};

/** The longest run of lines from the first that fits the room, each line costing its bytes and the newline before it. */
export const firstThatFit = (lines: readonly string[], room: number): string[] => {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = textBytes(line) + 1;
    if (used + cost > room) break;
    kept.push(line);
    used += cost;
  }
  return kept;
};

/** The rungs that reduce a set of lines, as what each keeps of them within the room it has. */
type ReducingRung = Exclude<SnapshotRung, 'full' | 'scope'>;
const REDUCING_RUNGS = SNAPSHOT_RUNGS.filter(
  (rung): rung is ReducingRung => rung !== 'full' && rung !== 'scope',
);
const REDUCTIONS: Readonly<
  Record<ReducingRung, (lines: readonly string[], room: number) => string[]>
> = {
  'words-only': (lines) => lines.filter(carriesWords),
  'words-cut': (lines, room) => firstThatFit(lines.filter(carriesWords), room),
  none: () => [],
};

const sameScope = (a: ActiveScope | null, b: ActiveScope): boolean =>
  a !== null && a.role === b.role && a.name === b.name;

/**
 * The lines of a snapshot inside the named scope — the scope's own node, every
 * node beneath it, and the property lines that hang off those — and the lines
 * outside it, each set in document order. A node line's scope is the walk's;
 * a property line belongs to the node above it.
 */
function splitByScope(
  lines: readonly string[],
  scope: ActiveScope,
): { inside: string[]; outside: string[] } {
  const nodes = decodeAriaSnapshot(lines.join('\n'));
  const scopes = scopesOf(nodes);
  const inside: string[] = [];
  const outside: string[] = [];
  let at = 0;
  let lastInScope = false;
  for (const line of lines) {
    const isNode = SNAPSHOT_NODE_LINE.exec(line)?.groups?.['role'] !== undefined;
    if (isNode) {
      lastInScope = sameScope(scopes[at] ?? null, scope);
      at += 1;
    }
    (lastInScope ? inside : outside).push(line);
  }
  return { inside, outside };
}

/**
 * The snapshot at the first rung that fits the budget: the whole; with an
 * open scope, that scope whole and the rest reduced — a dialog's twenty lines
 * are what the plan acts on, and the page behind it is what the rungs give
 * up first; then the lines with words; then those cut where the room ends;
 * then none.
 * A reduced snapshot opens with a line naming its rung and what it dropped,
 * so the dump and the model both know. Measured 2026-10-07: at the recorded
 * density a 1 400-line page lands on `none` inside the room a goal leaves,
 * so a bound alone would never put the open dialog in front of the model.
 */
export function fitSnapshot(
  snapshot: string,
  maxBytes: number,
  scope: ActiveScope | null = null,
): FittedSnapshot {
  if (textBytes(snapshot) <= maxBytes) return { text: snapshot, rung: 'full' };
  const lines = snapshot.split('\n').filter((line) => line.trim() !== '');
  // The longest a note can be: its counts at their largest, so a cut never overruns the budget.
  const noteRoom = (heading: string): number =>
    maxBytes - textBytes(`${heading}: ${lines.length} of ${lines.length} lines not shown]`) - 1;
  if (scope !== null) {
    const { inside, outside } = splitByScope(lines, scope);
    const heading = `[snapshot reduced to scope: the open ${scope.role} ${quotedJson(scope.name)} whole, the rest`;
    for (const rung of inside.length > 0 ? REDUCING_RUNGS : []) {
      const room = noteRoom(`${heading} ${rung}`) - textBytes(inside.join('\n')) - 1;
      const kept = REDUCTIONS[rung](outside, room);
      // A reduction that keeps no line is the none rung, and says so.
      if (kept.length === 0 && rung !== 'none') continue;
      const dropped = lines.length - inside.length - kept.length;
      const note = `${heading} ${rung}: ${dropped} of ${lines.length} lines not shown]`;
      const text = [note, ...inside, ...kept].join('\n');
      if (textBytes(text) <= maxBytes) return { text, rung: 'scope' };
    }
  }
  for (const rung of REDUCING_RUNGS) {
    const kept = REDUCTIONS[rung](lines, noteRoom(`[snapshot reduced to ${rung}`));
    if (kept.length === 0 && rung !== 'none') continue;
    const note = `[snapshot reduced to ${rung}: ${lines.length - kept.length} of ${lines.length} lines not shown]`;
    const text = [note, ...kept].join('\n');
    if (textBytes(text) <= maxBytes) return { text, rung };
  }
  // Unreachable: the `none` rung is one short line.
  return { text: '', rung: 'none' };
}
