/**
 * How prose names ids, read once for every reader. A lens is told to cite the
 * ids a render printed (`node.3`, `binding.1`), and in its own sentences it
 * writes them the way a person would: capitalised at the start of a sentence
 * (`Rationale.3 asserts…`), as a run (`edge.1-2`, the first through the
 * second) and as a list (`binding.3/7`, the third and the seventh). The API
 * grounds prose with this grammar and the studio substitutes labels with it,
 * so the two can never disagree about what a sentence cites.
 *
 * Matching is against the ids a record actually holds, never a guess at what
 * looks like one: an id nobody listed is left as written, and so is a run or a
 * list any member of which nobody listed.
 */

/** One place prose names listed ids. */
export interface RefMention {
  /** Where it starts in the prose. */
  index: number;
  /** As written: `edge.1-2`, `Rationale.3`, `binding.3/7`. */
  text: string;
  /** The listed ids it names, in order: the one, every member of a run, each of a list. */
  ids: string[];
  /** A lone id, a run (`-`, first through last) or a list (`/`, each named). */
  form: RefMentionForm;
}

export const REF_MENTION_FORMS = ['one', 'run', 'list'] as const;
export type RefMentionForm = (typeof REF_MENTION_FORMS)[number];

const escapeRegExp = (literal: string): string => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A global pattern matching any of `ids` as a whole token — longest first, so
 * a listed `node.1` never matches inside the `node.12` beside it — in either
 * case, with the run or list a numbered id may be continued by. The first
 * group is the id as written, the second its continuation. Null when there is
 * nothing to match. What a match names is `refMentions`' to say; a caller that
 * only needs the names should ask it.
 */
export function locationRefPattern(ids: readonly string[]): RegExp | null {
  if (ids.length === 0) return null;
  const alternatives = [...new Set(ids)].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`\\b(${alternatives.join('|')})([-–]\\d+|(?:/\\d+)+)?(?!\\w)`, 'gi');
}

/** `edge.12` → the stem `edge.` and 12; null for an id that does not end in a number. */
function numbered(id: string): { stem: string; number: number } | null {
  const parts = /^(.*\D)(\d+)$/s.exec(id);
  return parts === null ? null : { stem: parts[1] ?? '', number: Number(parts[2]) };
}

/**
 * Every place `prose` names any of `ids`, in order. An id is matched in
 * either case and answered as listed; a continuation is read only when every
 * id it implies is listed — `edge.1-3` names `edge.1`, `edge.2` and `edge.3`
 * when all three are — and otherwise the whole mention is no mention, left as
 * the prose wrote it.
 */
export function refMentions(prose: string, ids: readonly string[]): RefMention[] {
  const pattern = locationRefPattern(ids);
  if (pattern === null) return [];
  const listed = new Set(ids);
  const folded = new Map(ids.map((id) => [id.toLowerCase(), id]));
  const asListed = (written: string): string | undefined =>
    listed.has(written) ? written : folded.get(written.toLowerCase());

  const mentions: RefMention[] = [];
  for (const match of prose.matchAll(pattern)) {
    const [text, written = '', continuation = ''] = match;
    const first = asListed(written);
    if (first === undefined) continue;
    const named = continued(first, continuation, asListed);
    if (named === null) continue;
    mentions.push({ index: match.index, text, ...named });
  }
  return mentions;
}

/** What an id and its continuation name, or null when the continuation implies an id nobody listed. */
function continued(
  first: string,
  continuation: string,
  asListed: (written: string) => string | undefined,
): Pick<RefMention, 'ids' | 'form'> | null {
  if (continuation === '') return { ids: [first], form: 'one' };
  const head = numbered(first);
  if (head === null) return null;
  const sibling = (number: number) => asListed(`${head.stem}${number}`);

  const numbers = continuation
    .split(/[-–/]/)
    .filter((digits) => digits !== '')
    .map(Number);
  const isRun = !continuation.startsWith('/');
  const ids = [first];
  if (isRun) {
    // A run counts up from its first id; it is walked, never allocated, so
    // `node.1-99999999` stops at the first member nobody listed.
    const [last = head.number] = numbers;
    if (last <= head.number) return null;
    for (let number = head.number + 1; number <= last; number += 1) {
      const id = sibling(number);
      if (id === undefined) return null;
      ids.push(id);
    }
    return { ids, form: 'run' };
  }
  for (const number of numbers) {
    const id = sibling(number);
    if (id === undefined) return null;
    ids.push(id);
  }
  return { ids, form: 'list' };
}

/** The ids of `ids` that `prose` names, as listed, in the order it first names them. */
export function refIdsIn(prose: string, ids: readonly string[]): string[] {
  return [...new Set(refMentions(prose, ids).flatMap((mention) => mention.ids))];
}

/** `prose` with every mention replaced by what `render` gives for it; everything else as written. */
export function replaceRefs(
  prose: string,
  ids: readonly string[],
  render: (mention: RefMention) => string,
): string {
  let out = '';
  let cursor = 0;
  for (const mention of refMentions(prose, ids)) {
    out += prose.slice(cursor, mention.index) + render(mention);
    cursor = mention.index + mention.text.length;
  }
  return out + prose.slice(cursor);
}

/** How the members of a mention read once each is a label: a run by its ends, a list by each. */
const JOINED: Record<RefMentionForm, (labels: readonly string[]) => string> = {
  one: (labels) => labels.join(''),
  run: (labels) => `${labels[0] ?? ''} to ${labels[labels.length - 1] ?? ''}`,
  list: (labels) => labels.join(' / '),
};

/** A mention's members, each as `label` names it, joined the way its form reads. */
export const joinMention = (mention: RefMention, label: (id: string) => string): string =>
  JOINED[mention.form](mention.ids.map(label));

/**
 * Prose with every id the glossary holds replaced by its label — in either
 * case, runs and lists included. An id the glossary does not hold is left as
 * written, and a label put in place is never read again.
 */
export function substituteRefs(prose: string, glossary: ReadonlyMap<string, string>): string {
  return replaceRefs(prose, [...glossary.keys()], (mention) =>
    joinMention(mention, (id) => glossary.get(id) ?? id),
  );
}

/** The words of a text, folded: letters and digits, split on everything else. */
const wordsOf = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** A name as the words it is made of, folded: what every spelling of one name shares. */
const nameKey = (name: string): string => wordsOf(name).join(' ');

/**
 * How many times `prose` says each of `names` — as whole words in order, in
 * either case, whatever punctuation stands between or around them — where a
 * word is said for one name only. The longest saying claims its words first,
 * the leftmost of equals, and a saying any of whose words are claimed is no
 * saying: beside a part called "Orders DB", "the Orders DB" says "Orders DB"
 * once and neither "Orders" nor "DB" at all. Keyed by the folded name.
 */
function sayings(prose: string, names: readonly string[]): Map<string, number> {
  const words = wordsOf(prose);
  const spans = [...new Set(names.map(nameKey))]
    .filter((key) => key !== '')
    .flatMap((key) => {
      const said = key.split(' ');
      return words.flatMap((_, start) =>
        said.every((word, offset) => words[start + offset] === word)
          ? [{ key, start, length: said.length }]
          : [],
      );
    })
    .sort((a, b) => b.length - a.length || a.start - b.start);
  const claimed = new Array<boolean>(words.length).fill(false);
  const counts = new Map<string, number>();
  for (const { key, start, length } of spans) {
    const at = Array.from({ length }, (_, offset) => start + offset);
    if (at.some((index) => claimed[index])) continue;
    for (const index of at) claimed[index] = true;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * How a reader tells that a sentence has already said what a part is, one
 * saying at a time: each call takes one of the sayings `prose` has of `name`
 * among `names` — counted as `sayings` counts them, so a name inside a longer
 * one is the longer one's — and is true while one was left. A saying names
 * one part, the first to ask: two parts that share a name share its sayings,
 * and a name `names` does not hold is never said. A rule over the words,
 * never over where a ref sits: "the Orders DB at node.5", "node.5 (the
 * Orders DB)" and "The Orders DB primary (node.5)" all say "Orders DB".
 */
export function nameClaims(prose: string, names: readonly string[]): (name: string) => boolean {
  const left = sayings(prose, names);
  return (name) => {
    const key = nameKey(name);
    const count = left.get(key) ?? 0;
    if (count === 0) return false;
    left.set(key, count - 1);
    return true;
  };
}

/** Whether `prose` says `name` anywhere, as `nameClaims` reads a sentence with that one name in view. */
export const proseSays = (prose: string, name: string): boolean => nameClaims(prose, [name])(name);

/** `data_integrity` → `data integrity`: a wire token as the words it is made of, for the middle of a sentence. */
export const tokenWords = (token: string): string =>
  token
    .split(/[_\-.\s]+/)
    .filter((word) => word.length > 0)
    .join(' ');

/**
 * Prose with every token of an open vocabulary — a pipeline's declared finding
 * types, handed in by whoever knows the pipeline — replaced by the words it
 * reads as: "the data_integrity defect" → "the data integrity defect". Whole
 * tokens only, as declared; a token that is already a word is left alone.
 */
export function substituteTokens(
  prose: string,
  tokens: readonly string[],
  label: (token: string) => string = tokenWords,
): string {
  if (tokens.length === 0) return prose;
  const alternatives = [...new Set(tokens)].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return prose.replace(new RegExp(`\\b(?:${alternatives.join('|')})(?!\\w)`, 'g'), (token) =>
    label(token),
  );
}
