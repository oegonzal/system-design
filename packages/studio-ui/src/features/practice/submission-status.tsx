'use client';

import { Badge } from '@sysdesign/design-system';

import { GRADE_STANDING_LABEL, type GradeStanding } from '../evaluation/score';

export interface SubmissionStatusProps {
  /** The author's latest submission; nothing to show until there is one. */
  revisionNumber: number | null;
  /** Where its grade stands — the session's word, whatever the canvas shows. */
  standing: GradeStanding | null;
}

/**
 * The author's latest submission and where its grade stands, named as that
 * — `submitted #2 · graded`, said in full by its title — so it never reads
 * as a label for whatever the canvas shows: a revision loaded read-only, or
 * a draft restored from one, is not what this badge is about. A grade that
 * earned no score is "not assessed", never "graded". It sits beside the
 * session's title, because it is the session's: the toolbar is the canvas's
 * instrument panel, about the draft on it, and keeps one row at a laptop's
 * width without a badge of up to thirty characters among its buttons.
 */
export function SubmissionStatus({ revisionNumber, standing }: SubmissionStatusProps) {
  if (standing === null || revisionNumber === null) return null;
  return (
    <Badge
      tone={standing === 'failed' ? 'critical' : 'neutral'}
      title={`Your latest submission, revision #${revisionNumber}: ${GRADE_STANDING_LABEL[standing]}`}
      data-testid="submission-status"
      data-revision={revisionNumber}
      data-status={standing}
    >
      {`submitted #${revisionNumber} · ${GRADE_STANDING_LABEL[standing]}`}
    </Badge>
  );
}
