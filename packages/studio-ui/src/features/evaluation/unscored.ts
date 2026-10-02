import type { EvaluationDto, UnscoredReason } from '@sysdesign/contracts';

import { unansweredNote } from './degraded';
import { counted } from './humanize';

/** What a reader is told about a grade that earned no score: a headline, then why and what is left to do. */
export interface UnscoredNote {
  title: string;
  body: string;
}

/** The way back from a grade the lenses could not settle: the same one a failed grade offers. */
const GRADE_AGAIN =
  'Nothing here is a verdict on your design. Grade it again — the revision stays as it is.';

type UnscoredGrade = Pick<EvaluationDto, 'unscored' | 'decisionBasis' | 'degraded'>;

/** Why the lenses settled too little, from what the grade itself recorded. */
function unassessedWhy({ decisionBasis, degraded }: UnscoredGrade): string {
  const share =
    decisionBasis === null
      ? 'The lenses could not assess enough of the criteria to score the design.'
      : `The lenses assessed ${decisionBasis.criteria.assessed} of ${counted(
          decisionBasis.criteria.total,
          'criterion',
          'criteria',
        )} — too few to score the design.`;
  return [share, unansweredNote(degraded), GRADE_AGAIN].filter(Boolean).join(' ');
}

/** Every reason the contract names for a complete grade to have no score, worded. */
const UNSCORED: Record<UnscoredReason, (grade: UnscoredGrade) => UnscoredNote> = {
  unassessed: (grade) => ({
    title: 'This revision couldn’t be graded',
    body: unassessedWhy(grade),
  }),
  'no-artifact': () => ({
    title: 'There was nothing to grade',
    body: 'The grader had no design to judge, so there is no score.',
  }),
};

/**
 * A complete grade that earned no score (`EvaluationDto.unscored`), to its
 * author: what happened, why — the criteria the lenses assessed of how many,
 * and the lens samples that did not answer — and what is left to do. Never a
 * 0, a decision or "the score stands": the loop's number there is no score,
 * and its escalation no verdict on the design. Null for a grade with a
 * score. The panel and the export say the same words.
 */
export const unscoredNote = (grade: UnscoredGrade): UnscoredNote | null =>
  grade.unscored === null ? null : UNSCORED[grade.unscored](grade);
