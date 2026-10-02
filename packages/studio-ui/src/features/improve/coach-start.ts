import { describeUnassessedBase } from '@sysdesign/contracts';

import type { GradeStanding } from '../evaluation/score';

/** The revision the canvas shows as it was stored, unedited, with where its grade stands. */
export interface CanvasRevision {
  id: string;
  revisionNumber: number;
  /** Null when it has no grade the page knows of. */
  standing: GradeStanding | null;
}

/**
 * Where a coach run would start from what the canvas shows. `revision`: an
 * unedited revision whose grade is a verdict is handed over as it is, and the
 * loop adopts its grade as the starting point. `draft`: anything else — an
 * edited canvas, a revision with no grade to adopt — is submitted as a
 * revision first, and the coach's first iteration grades it. `refused`: an
 * unedited revision whose grade earned no score is no starting point — the
 * coach would measure every revision against a number that was never a
 * score — so the start is refused with the API's own words, and grading the
 * revision again is the way on.
 */
export type CoachStart =
  | { from: 'revision'; revisionId: string; revisionNumber: number }
  | { from: 'draft' }
  | { from: 'refused'; reason: string };

/** What a coach start would hand over, given the revision the canvas shows unedited — null when it shows a draft. */
export function coachStart(onCanvas: CanvasRevision | null): CoachStart {
  if (onCanvas === null) return { from: 'draft' };
  switch (onCanvas.standing) {
    case 'complete':
      return { from: 'revision', revisionId: onCanvas.id, revisionNumber: onCanvas.revisionNumber };
    case 'unscored':
      return { from: 'refused', reason: describeUnassessedBase(onCanvas.revisionNumber) };
    default:
      return { from: 'draft' };
  }
}
