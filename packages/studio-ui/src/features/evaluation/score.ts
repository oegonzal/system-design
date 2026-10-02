import type { EvaluationDto, QualityRunStatus, RevisionEvaluationRef } from '@sysdesign/contracts';

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
 * Where a grade stands for a reader: still running, failed, a verdict
 * (`complete`), or complete with no verdict — `unscored`, a grade that earned
 * no score (`EvaluationDto.unscored`). Kept apart from `complete` so no
 * surface calls a grade that judged nothing "graded", or prints its decision
 * as a verdict on the design.
 */
export type GradeStanding = QualityRunStatus | 'unscored';

/** A grade's standing, read from the grade itself. */
export const standingOf = (grade: Pick<EvaluationDto, 'status' | 'unscored'>): GradeStanding =>
  grade.status === 'complete' && grade.unscored !== null ? 'unscored' : grade.status;

/**
 * A stored revision's grade's standing, read from what the studio cached of
 * it: a complete grade with no score earned none — never a 0
 * (`RevisionEvaluationRef.overall`).
 */
export const cachedStandingOf = (
  grade: Pick<RevisionEvaluationRef, 'status' | 'overall'>,
): GradeStanding =>
  grade.status === 'complete' && grade.overall === null ? 'unscored' : grade.status;

/**
 * A grade's standing in the studio's words — the toolbar's revision badge,
 * a timeline chip, the dashboard and the export's Status column print the
 * same ones, never the wire token.
 */
export const GRADE_STANDING_LABEL: Readonly<Record<GradeStanding, string>> = {
  running: 'grading…',
  complete: 'graded',
  unscored: 'not assessed',
  failed: 'grading failed',
};
