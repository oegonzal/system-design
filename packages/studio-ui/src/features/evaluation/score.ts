import type { QualityRunStatus } from '@sysdesign/contracts';

/** What a score reads as when there is none: never graded, or nothing earned one. */
export const NO_SCORE = '—';

/**
 * A 0–100 score as every surface prints it: whole points, so the headline, a
 * dimension's meter (its `formatValue`), a timeline chip, a coach row, the
 * dashboard and the export never print the same number two ways. Only the
 * printing rounds; the number itself stays as the loop reported it.
 */
export function formatScore(score: number | null | undefined): string {
  return score === null || score === undefined ? NO_SCORE : String(Math.round(score));
}

/**
 * A grading run's status in the studio's words — the toolbar's revision badge
 * and the export's Status column print the same three, never the wire token.
 */
export const GRADE_STATUS_LABEL: Readonly<Record<QualityRunStatus, string>> = {
  running: 'grading…',
  complete: 'graded',
  failed: 'grading failed',
};
