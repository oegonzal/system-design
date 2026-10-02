/**
 * Run folder names, chronological by construction.
 *
 * The stamp is an ISO timestamp with the characters a filesystem dislikes
 * swapped out, which leaves lexicographic order identical to chronological
 * order — `ls` and a plain sort both come back in the order things happened.
 * The hex suffix breaks ties between two runs in the same millisecond. A dump
 * folder adds its kind; the code review's run records use the bare stamp.
 *
 * Clock and randomness are parameters, both so this is testable and because the
 * engine promises neither — this lives in the app layer for that reason.
 */
export const RUN_KINDS = ['quality'] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export function makeRunStamp(now: number, random: () => number = Math.random): string {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-').replace('Z', '');
  const suffix = Math.floor(random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `${stamp}-${suffix}`;
}

export function makeRunId(now: number, kind: RunKind, random: () => number = Math.random): string {
  return `${makeRunStamp(now, random)}-${kind}`;
}

/**
 * The grammar above, read back — built from the same pieces `makeRunId` writes,
 * so the two cannot drift.
 *
 * This exists for one reason: a reader that takes a run id from a request must
 * answer "is this a name this package could have minted" before it touches the
 * filesystem. An id that is not one never becomes a path at all.
 */
const RUN_ID = new RegExp(
  `^\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}-[0-9a-f]{6}-(?:${RUN_KINDS.join('|')})$`,
);

export const isRunId = (value: string): boolean => RUN_ID.test(value);
