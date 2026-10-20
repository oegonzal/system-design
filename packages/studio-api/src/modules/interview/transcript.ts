import {
  firstSection,
  PRACTICE_FORMATS,
  TRANSCRIPT_VERSION,
  type DesignSubmission,
  type DesignTranscript,
  type PracticeFormat,
  type PracticeFormatId,
  type SessionViewDto,
  type SuccessCriterion,
  type TranscriptPhase,
  type TranscriptTurn,
} from '@sysdesign/contracts';
import type { EntityManager } from '@mikro-orm/postgresql';
import { InterviewTurn, type DesignSession } from '@sysdesign/db';

import { advancePhase, type PhaseState } from './session-phase';

/** A stored turn as the transcript carries it; an interviewer turn not yet claimed, or that got no reply, is left out. */
export const toTranscriptTurn = (turn: InterviewTurn): TranscriptTurn | null =>
  turn.text.length === 0
    ? null
    : {
        role: turn.role,
        phase: turn.phase,
        text: turn.text,
        ...(turn.role === 'interviewer'
          ? { disclosesCriterionIds: turn.disclosedCriterionIds }
          : {}),
      };

/**
 * The transcript a submission carries: the turns taken, in order, and the
 * phases entered. Null for a session that took no turn and entered no phase
 * — every session of a format without an interviewer.
 */
export function composeTranscript(
  turns: readonly InterviewTurn[],
  phases: readonly TranscriptPhase[],
): DesignTranscript | null {
  const spoken = turns.flatMap((turn) => {
    const mapped = toTranscriptTurn(turn);
    return mapped === null ? [] : [mapped];
  });
  if (spoken.length === 0 && phases.length === 0) return null;
  return { version: TRANSCRIPT_VERSION, turns: spoken, phases: [...phases] };
}

/** The criteria the interviewer's claimed replies have given away, by id. */
export const disclosedCriteria = (turns: readonly InterviewTurn[]): Set<string> =>
  new Set(turns.flatMap((turn) => turn.disclosedCriterionIds));

/**
 * The prompt as the author may see it now, from the format's declaration:
 * the whole prompt and rubric for a format that shows them; for one that
 * reveals by section, its first section and the criteria disclosed so far —
 * until the design is submitted, after which the whole prompt is theirs to
 * read beside the grade.
 */
export function sessionView(
  prompt: { markdown: string; criteria: SuccessCriterion[]; format: PracticeFormatId },
  disclosed: ReadonlySet<string>,
  submitted: boolean,
): SessionViewDto {
  const format = PRACTICE_FORMATS[prompt.format];
  if (format.reveal === 'whole' || submitted) {
    return { markdown: prompt.markdown, criteria: prompt.criteria, withheld: 0 };
  }
  const criteria = prompt.criteria.filter((criterion) => disclosed.has(criterion.id));
  return {
    markdown: firstSection(prompt.markdown),
    criteria,
    withheld: prompt.criteria.length - criteria.length,
  };
}

/**
 * The submission as it is graded: the author's parts with the session's
 * transcript composed onto them from the turns stored, under the clock the
 * submit closes. The clock is returned beside it for the caller to record
 * once the grade has started — a loop that refuses leaves the clock alone.
 */
export async function gradedSubmission(
  em: EntityManager,
  session: DesignSession,
  format: PracticeFormat,
  submission: DesignSubmission,
  now: Date,
): Promise<{ graded: DesignSubmission; clock: PhaseState }> {
  const turns = await em.find(
    InterviewTurn,
    { session: session.id },
    { orderBy: { ordinal: 'asc' } },
  );
  const clock = advancePhase(session, format, 'submit', now);
  const transcript = composeTranscript(turns, clock.phaseLog);
  return { graded: { ...submission, ...(transcript ? { transcript } : {}) }, clock };
}
