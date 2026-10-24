import type { ApiResponse } from '../envelope';
import type { Decision } from '../quality-loop/vocab';
import type { RenderedIntroduction } from '../introduction-note';
import type { TargetKind } from './vocab';

/**
 * An introduction drafted for a tracked firm or award about one program: the
 * quality loop's `introduction-note` run, started by the service from the
 * target, the award's record and the profile's offers, read back by its run
 * id, and logged on the target once it is ready.
 */
export interface StartIntroductionRequest {
  kind: TargetKind;
  subject: string;
  /** The program the note is about, by the id its record is read by. */
  awardExternalId: string;
  /** The profile whose offers and facts the note is written from; the default when absent. */
  profile?: string;
}

export interface IntroductionStartedDto {
  runId: string;
}

export const INTRODUCTION_STATUSES = ['pending', 'ready', 'failed'] as const;
export type IntroductionStatus = (typeof INTRODUCTION_STATUSES)[number];

export interface IntroductionDto {
  runId: string;
  status: IntroductionStatus;
  /** The note as one text, once ready. */
  note: RenderedIntroduction | null;
  /** What the judges decided of it and how it scored, once ready. */
  decision: Decision | null;
  overall: number | null;
  /** Why nothing is ready, when it failed. */
  reason: string | null;
}

export type StartIntroductionResponse = ApiResponse<IntroductionStartedDto>;
export type GetIntroductionResponse = ApiResponse<IntroductionDto>;
