/**
 * Run folder names, chronological by construction.
 *
 * The stamp is an ISO timestamp with the characters a filesystem dislikes
 * swapped out, which leaves lexicographic order identical to chronological
 * order — `ls` and a plain sort both come back in the order things happened.
 * The hex suffix breaks ties between two runs in the same millisecond, and the
 * kind makes an eval run distinguishable from a prompt or suggestion run at a
 * glance.
 *
 * Clock and randomness are parameters, both so this is testable and because the
 * engine promises neither — this lives in the app layer for that reason.
 */
export type RunKind = 'eval' | 'prompt' | 'suggestion' | 'improve';

export function makeRunId(now: number, kind: RunKind, random: () => number = Math.random): string {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-').replace('Z', '');
  const suffix = Math.floor(random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `${stamp}-${suffix}-${kind}`;
}
