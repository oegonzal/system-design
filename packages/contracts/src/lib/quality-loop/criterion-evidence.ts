import type { ApiResponse } from '../envelope';
import type { IsoDateString } from '../primitives';
import type { CriterionEvidence } from './evidence';

/** One recorded iteration, by the run that holds it and its number within the run. */
export interface IterationRef {
  runId: string;
  iteration: number;
}

/** How many iterations one evidence read may ask for; a caller with more pages them. */
export const MAX_EVIDENCE_REFS = 500;

/**
 * `POST /runs/evidence` — the criterion verdicts of named iterations, read in
 * one call. A caller that keeps a pointer to the iteration a design was
 * graded under (the studio's revisions) reads its competencies this way
 * without reading every run's whole trace, and without joining the loop's
 * tables, which are not its to read.
 */
export interface ReadIterationEvidenceRequest {
  iterations: IterationRef[];
}

/** One iteration's verdicts as recorded; an iteration the loop never recorded is left out of the answer. */
export interface IterationEvidenceDto extends IterationRef {
  /** When the run finished, or null while it runs. */
  finishedAt: IsoDateString | null;
  criteria: CriterionEvidence[];
}

export type ReadIterationEvidenceResponse = ApiResponse<IterationEvidenceDto[]>;
