import { z } from 'zod';

import { bound, bounded } from './bounds';
import { CRITERION_ID_MAX_LENGTH } from './quality-loop/evidence';

/**
 * The record of an interview session, composed by the studio from the turns
 * it stored — never typed by the author, never written by the coach — and
 * carried on the submission so the graders read what was asked and answered
 * beside the design. A turn is cited as `turn.N`.
 */
export const TRANSCRIPT_ROLES = ['interviewer', 'candidate'] as const;
export type TranscriptRole = (typeof TRANSCRIPT_ROLES)[number];

export const TRANSCRIPT_VERSION = 1;

export const TRANSCRIPT_TURNS_BOUND = bound(60, 'list');
export const TURN_TEXT_BOUND = bound(1200);
export const TURN_DISCLOSURES_BOUND = bound(27, 'list');
export const TRANSCRIPT_PHASES_BOUND = bound(6, 'list');
/** A phase id is a format's own declared token, never prose. */
export const PHASE_ID_MAX_LENGTH = 40;

export const transcriptTurnSchema = z.strictObject({
  role: z.enum(TRANSCRIPT_ROLES),
  phase: bounded.id(PHASE_ID_MAX_LENGTH, { min: 1 }),
  text: bounded.text(TURN_TEXT_BOUND, { min: 1, trim: true }),
  /** The rubric criteria an interviewer's answer gave away, by id. */
  disclosesCriterionIds: bounded
    .list(TURN_DISCLOSURES_BOUND, bounded.id(CRITERION_ID_MAX_LENGTH, { min: 1 }))
    .optional(),
});
export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;

export const transcriptPhaseSchema = z.strictObject({
  id: bounded.id(PHASE_ID_MAX_LENGTH, { min: 1 }),
  startedAt: z.iso.datetime(),
  /** Null while the phase is the current one. */
  endedAt: z.iso.datetime().nullable(),
});
export type TranscriptPhase = z.infer<typeof transcriptPhaseSchema>;

export const designTranscriptSchema = z.strictObject({
  version: z.literal(TRANSCRIPT_VERSION),
  turns: bounded.list(TRANSCRIPT_TURNS_BOUND, transcriptTurnSchema),
  phases: bounded.list(TRANSCRIPT_PHASES_BOUND, transcriptPhaseSchema),
});
export type DesignTranscript = z.infer<typeof designTranscriptSchema>;
