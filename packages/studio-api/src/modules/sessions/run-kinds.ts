import type {
  AdoptedIterationRef,
  Decision,
  DesignSubmission,
  QualityRunStatus,
  StartQualityRunRequest,
} from '@sysdesign/contracts';

/** The terminal values an import already knows, written with the row instead of after it. */
export interface RevisionCache {
  status: QualityRunStatus;
  overall: number | null;
  decision: Decision | null;
}

/** What a grading run is started over: the submission itself, or a recorded iteration to adopt. */
export type RunSource = { output: DesignSubmission } | { adopt: AdoptedIterationRef };

/**
 * What each kind of run asks of the loop beyond the run itself. A coach
 * recalls lessons from earlier runs for its producer — the lenses never see
 * them; a grade never recalls, so an author's score rests on the prompt alone.
 */
export const RUN_KINDS = {
  grade: {},
  coach: { recall: true },
} as const satisfies Record<string, Pick<StartQualityRunRequest, 'recall'>>;
export type RunKind = keyof typeof RUN_KINDS;
