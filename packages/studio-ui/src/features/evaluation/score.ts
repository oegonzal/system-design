/** What a score reads as when there is none: never graded, or nothing earned one. */
export const NO_SCORE = '—';

/**
 * A 0–100 score as every surface prints it: whole points — the precision the
 * design system's `Meter` shows its value at — so the headline, a
 * dimension's bar, a timeline chip and a coach row never print the same
 * number two ways. Only the printing rounds; the number itself stays as the
 * loop reported it.
 */
export function formatScore(score: number | null | undefined): string {
  return score === null || score === undefined ? NO_SCORE : String(Math.round(score));
}
