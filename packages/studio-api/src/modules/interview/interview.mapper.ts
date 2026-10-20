import type {
  InterviewPendingDto,
  InterviewStateDto,
  InterviewTurnDto,
} from '@sysdesign/contracts';
import type { DesignSession, InterviewTurn } from '@sysdesign/db';

export const toInterviewTurnDto = (turn: InterviewTurn): InterviewTurnDto => ({
  id: turn.id,
  ordinal: turn.ordinal,
  phase: turn.phase,
  role: turn.role,
  text: turn.text,
  disclosesCriterionIds: turn.disclosedCriterionIds,
  runId: turn.runId,
  decision: turn.decision,
  overall: turn.overall,
  createdAt: turn.createdAt.toISOString(),
});

export const toInterviewState = (
  session: DesignSession,
  turns: readonly InterviewTurn[],
  pending: InterviewPendingDto | null,
): InterviewStateDto => ({
  phase: session.phase,
  phaseStartedAt: session.phaseStartedAt?.toISOString() ?? null,
  phases: session.phaseLog,
  turns: turns.map(toInterviewTurnDto),
  pending,
});
