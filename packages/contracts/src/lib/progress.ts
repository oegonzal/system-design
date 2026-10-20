import type { ApiResponse } from './envelope';
import type { IsoDateString } from './primitives';

/**
 * How the author is doing on one competency, counted from the verdicts the
 * loop recorded on their own revisions — never a number the studio invents.
 * `assessed` is the verdicts that settled (pass, partial or fail); a criterion
 * nobody judged, or one the panel set aside, is not counted. `recent` is the
 * share of passes, partial counted as nothing, in each of the last sessions
 * in which the kind was assessed, newest last, so a reader can see a trend
 * without a slope the studio computed for them.
 */
export interface CompetencyProgressDto {
  kind: string;
  assessed: number;
  passed: number;
  partial: number;
  failed: number;
  /** The newest graded revision that assessed this kind, or null when none did. */
  lastPractisedAt: IsoDateString | null;
  recent: number[];
}

export interface ProgressDto {
  /** Every declared kind, in the contract's order; a kind never assessed has zeros and no date. */
  competencies: CompetencyProgressDto[];
  /** How many sessions carried a graded revision of the author's own. */
  sessions: number;
}

export type GetProgressResponse = ApiResponse<ProgressDto>;
