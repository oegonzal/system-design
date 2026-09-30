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
export type RunKind = 'quality';

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
