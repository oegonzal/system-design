import type { RunOpenerDto } from '@sysdesign/contracts';

/**
 * Who opened what, as the inspector's lists say it.
 *
 * A record names its opener only when its caller did — a browser session names
 * itself on every run it opens, and an orchestration's children inherit it —
 * so everything here is read off `openedBy` and nothing is inferred from a
 * goal, a pipeline or a time. The openers the filter offers are the ones the
 * loaded records name, which is why the module takes records rather than a
 * list of callers: the loop keeps no such list.
 */

/** A record as this module reads it: run summaries and orchestrations both qualify. */
export interface OpenedRecord {
  openedBy: RunOpenerDto | null;
  startedAt: string;
}

/** One opener the filter can offer. */
export interface OpenerOption {
  /** What the URL carries and the lists are filtered by. */
  id: string;
  text: string;
}

/** How much of a list was read: the rows it holds, and how many the loop has in all. */
export interface ListCount {
  shown: number;
  total: number;
}

/** An opener's id is a session's UUID; its head tells one session from another at a glance. */
const SHORT_ID_LENGTH = 8;

const headOf = (opener: RunOpenerDto): string =>
  `${opener.kind} ${opener.id.slice(0, SHORT_ID_LENGTH)}`;

/** Who opened a record, as a row says it — "browser-session e657ef24 · step 6" — or null when nobody said. */
export const openerText = (openedBy: RunOpenerDto | null): string | null =>
  openedBy === null
    ? null
    : openedBy.label === ''
      ? headOf(openedBy)
      : `${headOf(openedBy)} · ${openedBy.label}`;

/**
 * The openers the loaded records name, one per id, the most recently started
 * first; each is dated by its earliest record here. The opener the URL names is
 * always offered, by its bare id when no loaded record names it, so a link to a
 * session older than every recent record still shows what it is filtered by.
 */
export function openersOf(records: readonly OpenedRecord[], named: string | null): OpenerOption[] {
  const earliest = new Map<string, { opener: RunOpenerDto; at: number }>();
  for (const record of records) {
    if (record.openedBy === null) continue;
    const at = Date.parse(record.startedAt);
    const seen = earliest.get(record.openedBy.id);
    if (seen === undefined || at < seen.at) {
      earliest.set(record.openedBy.id, { opener: record.openedBy, at });
    }
  }
  const options = [...earliest.values()]
    .sort((a, b) => b.at - a.at)
    .map(({ opener, at }) => ({
      id: opener.id,
      text: `${headOf(opener)} · ${new Date(at).toLocaleString()}`,
    }));
  return named === null || earliest.has(named) ? options : [...options, { id: named, text: named }];
}

/** One opener's records read the way it opened them: oldest first, step by step. */
export const inStartOrder = <T extends OpenedRecord>(records: readonly T[]): T[] =>
  [...records].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

const counted = ({ shown, total }: ListCount): string =>
  shown < total ? `the latest ${shown} of ${total}` : String(total);

/**
 * What the narrowed lists hold, said under the filter: their order, since it is
 * the reverse of the recent lists', and how much of each was read — a list
 * holds at most one page, so a long session says where its earliest records went.
 */
export const narrowedHint = (runs: ListCount, orchestrations: ListCount): string =>
  `Oldest first — runs: ${counted(runs)}, orchestrations: ${counted(orchestrations)}.`;
