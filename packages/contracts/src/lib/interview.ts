import { z } from 'zod';

import { bound, bounded } from './bounds';
import type { ApiResponse } from './envelope';
import type { IsoDateString, Uuid } from './primitives';
import { CRITERION_ID_MAX_LENGTH } from './quality-loop/evidence';
import type { SuccessCriterion } from './quality-loop/evidence';
import type { Decision } from './quality-loop/vocab';
import type { QualityRunStatus } from './quality-loop/runs';
import type { TranscriptPhase, TranscriptRole } from './transcript.schema';

/**
 * Interview mode: the interviewer is a quality-loop run of the `interview-turn`
 * pipeline, one per exchange. The studio composes its goal — the prompt as
 * the interviewer's notes, the transcript so far, and the items to answer,
 * each indexed — and claims the reply once by the run's id. The reply's shape
 * is declared here so the studio reads the artifact the pipeline wrote
 * through the one schema, as it reads a prompt draft.
 */
export const INTERVIEW_PIPELINE_ID = 'interview-turn';

/** One exchange is one iteration: a reply is claimed whatever the judges decided, and the decision is shown. */
export const INTERVIEW_TURN_ITERATIONS = 1;

/**
 * The three rules every turn is judged on, declared once: the pipeline fixes
 * them on every rubric it derives, and the studio supplies them as the rubric
 * of every turn it starts, so no turn pays for a derivation and both read
 * one declaration.
 */
export const INTERVIEW_TURN_RULES = [
  {
    kind: 'fidelity',
    statement:
      'Every reply states only what the interviewer’s notes state, and where they are silent says the problem does not specify it.',
  },
  {
    kind: 'restraint',
    statement:
      'No reply proposes, hints at or endorses a design, and each lists exactly the rubric criteria it gives away.',
  },
  {
    kind: 'clarity',
    statement:
      'Every listed item is addressed directly, briefly, in an interviewer’s spoken voice.',
  },
] as const;

/** The rules as a supplied rubric, ids positional as the pipeline would assign them. */
export const interviewTurnRubric = (): SuccessCriterion[] =>
  INTERVIEW_TURN_RULES.map((rule, index) => ({ id: `c${index + 1}`, ...rule }));

/** What the candidate may ask in one clarify round, and how long each question and answer may run. */
export const INTERVIEW_QUESTIONS_BOUND = bound(5, 'list');
export const INTERVIEW_QUESTION_BOUND = bound(400);
export const INTERVIEW_ANSWER_BOUND = bound(2000);

/** The items a turn's goal indexes for the interviewer to address: the candidate's questions, or the criteria to probe. */
export const INTERVIEW_ITEM_KINDS = ['question', 'target'] as const;
export type InterviewItemKind = (typeof INTERVIEW_ITEM_KINDS)[number];
/** `question.N` / `target.N` — short by construction. */
export const INTERVIEW_ITEM_ID_MAX_LENGTH = 16;

export const INTERVIEW_REPLIES_BOUND = bound(6, 'list');
export const REPLY_TEXT_BOUND = bound(900);
export const REPLY_DISCLOSURES_BOUND = bound(8, 'list');

export const interviewReplySchema = z.strictObject({
  to: bounded.id(INTERVIEW_ITEM_ID_MAX_LENGTH, {
    min: 1,
    description:
      'The indexed item this reply addresses: question.N or target.N, exactly as listed.',
  }),
  text: bounded.text(REPLY_TEXT_BOUND, {
    min: 1,
    description:
      'What the interviewer says: an answer drawn from the notes, or a probing question, in the interviewer’s own voice.',
  }),
  disclosesCriterionIds: bounded.list(
    REPLY_DISCLOSURES_BOUND,
    bounded.id(CRITERION_ID_MAX_LENGTH, { min: 1 }),
    {
      description:
        'The rubric criteria this reply gives away, by their listed ids, so the candidate’s view can show them from now on; empty when it gives away none.',
    },
  ),
});

export const interviewTurnOutputSchema = z.strictObject({
  replies: bounded.list(INTERVIEW_REPLIES_BOUND, interviewReplySchema),
});
export type InterviewTurnOutput = z.infer<typeof interviewTurnOutputSchema>;

/**
 * The index a turn's composer writes under the goal and the pipeline's
 * validator reads: every item the interviewer must address, and every
 * criterion id a reply may disclose. Declared data, never a reading of prose.
 */
export const interviewIndexSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.string(),
      kind: z.enum(INTERVIEW_ITEM_KINDS),
    }),
  ),
  criterionIds: z.array(z.string()),
});
export type InterviewIndex = z.infer<typeof interviewIndexSchema>;

// --- The studio's wire ---------------------------------------------------

export interface InterviewTurnDto {
  id: Uuid;
  ordinal: number;
  phase: string;
  role: TranscriptRole;
  /** Empty while an interviewer turn's reply has not been claimed. */
  text: string;
  disclosesCriterionIds: string[];
  /** The run that answered an interviewer turn; null for the candidate's own. */
  runId: string | null;
  /** The judges' decision on the reply, shown as a badge; null for a candidate turn or an unclaimed one. */
  decision: Decision | null;
  overall: number | null;
  createdAt: IsoDateString;
}

/** The interviewer turn still being answered, as the loop reports its run. */
export interface InterviewPendingDto {
  runId: string;
  status: QualityRunStatus;
  error: string | null;
}

export interface InterviewStateDto {
  /** The current phase's id, or null for a session whose format has no phases. */
  phase: string | null;
  phaseStartedAt: IsoDateString | null;
  /** Every phase entered so far, in order, the current one with no end. */
  phases: TranscriptPhase[];
  turns: InterviewTurnDto[];
  pending: InterviewPendingDto | null;
}

export interface ClarifyRequest {
  questions: string[];
}

export interface AnswerRequest {
  text: string;
}

export interface InterviewTurnStartedDto {
  runId: string;
  status: QualityRunStatus;
}

export type GetInterviewResponse = ApiResponse<InterviewStateDto>;
export type StartInterviewTurnResponse = ApiResponse<InterviewTurnStartedDto>;
export type AnswerInterviewResponse = ApiResponse<InterviewTurnDto>;
