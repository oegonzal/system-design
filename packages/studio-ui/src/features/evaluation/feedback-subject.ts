import type { RevisionOrigin } from '@sysdesign/contracts';

/**
 * Whose feedback the tab shows. The feedback follows a revision; the canvas
 * may have moved on to the draft — a revision restored as the draft, a
 * session opened on a saved one — and the tab says so rather than let a
 * score read as the verdict on what is drawn now. The export reads the same
 * subject: its diagram is the canvas, and its feedback this revision's.
 */
export interface FeedbackSubject {
  revisionNumber: number;
  origin: RevisionOrigin;
  /** Whether the canvas shows this revision as it was graded; false once it shows the draft. */
  onCanvas: boolean;
}

/** What the tab and the export say when the canvas no longer shows the revision its feedback is about. */
export const OFF_CANVAS_COPY = 'The canvas shows your draft, not this revision.';
