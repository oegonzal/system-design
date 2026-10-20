'use client';

import styled from '@emotion/styled';
import {
  INTERVIEW_QUESTIONS_BOUND,
  type InterviewStateDto,
  type InterviewTurnDto,
  type PracticeFormat,
} from '@sysdesign/contracts';
import {
  Alert,
  Badge,
  Button,
  DECISION_TONE,
  LiveRegion,
  Spinner,
  Stack,
  Text,
  TextAreaField,
} from '@sysdesign/design-system';
import { useEffect, useRef, useState } from 'react';

import { humanizeToken } from '../../evaluation/humanize';
import { PhaseTimer } from './phase-timer';
import { useInterview } from './use-interview';

export interface InterviewPanelProps {
  sessionId: string;
  /** The session's format: its phases say what the panel offers next; nothing here reads the format's id. */
  format: PracticeFormat;
  /** Viewing an old revision: the interview is history, not something to add to. */
  readOnly: boolean;
  /** The state as each read returned it — the workspace refreshes the candidate's view from it. */
  onState?: (state: InterviewStateDto) => void;
}

const Turns = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space[3]}px;
`;

const Turn = styled.li`
  display: grid;
  gap: ${({ theme }) => theme.space[1]}px;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.subtle};
  white-space: pre-wrap;
`;

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

function TurnRow({ turn, answering }: { turn: InterviewTurnDto; answering: boolean }) {
  return (
    <Turn data-testid="interview-turn" data-role={turn.role}>
      <Stack direction="row" gap={2} align="center" wrap>
        <Badge tone={turn.role === 'interviewer' ? 'accent' : 'neutral'}>
          {humanizeToken(turn.role)}
        </Badge>
        <Text as="span" size="sm" tone="muted">
          {humanizeToken(turn.phase)}
        </Text>
        {turn.decision !== null ? (
          <Badge tone={DECISION_TONE[turn.decision]} data-testid="turn-decision">
            {humanizeToken(turn.decision)}
          </Badge>
        ) : null}
      </Stack>
      {turn.text.length > 0 ? (
        <Text size="sm">{turn.text}</Text>
      ) : (
        <Text size="sm" tone="muted">
          {answering ? 'The interviewer is answering…' : 'No reply was recorded.'}
        </Text>
      )}
    </Turn>
  );
}

/**
 * The interview beside the canvas: the phase and its clock, every turn so
 * far, and what the candidate may do next — ask, answer, open the deep dive
 * or move on — each offered by the current phase's declared rule, never by
 * the format's name. A reply is shown only once the server has claimed it.
 */
export function InterviewPanel({ sessionId, format, readOnly, onState }: InterviewPanelProps) {
  const interview = useInterview(sessionId);
  const { state } = interview;
  const [text, setText] = useState('');
  const onStateRef = useRef(onState);
  useEffect(() => {
    onStateRef.current = onState;
  });
  useEffect(() => {
    if (state !== null) onStateRef.current?.(state);
  }, [state]);

  const current = format.phases.find((phase) => phase.id === state?.phase) ?? null;
  const next =
    current === null ? null : (format.phases[format.phases.indexOf(current) + 1] ?? null);
  const pending = state?.pending ?? null;
  const frozen = readOnly || interview.busy || pending !== null;
  const questions = lines(text);
  const tooMany = questions.length > INTERVIEW_QUESTIONS_BOUND.target;
  const message =
    pending !== null
      ? 'The interviewer is answering.'
      : state !== null && state.turns.length > 0
        ? `${state.turns.length} turns so far.`
        : '';

  if (state === null) {
    return interview.error !== null ? (
      <Alert tone="danger" title="Couldn't read the interview" data-testid="interview-error">
        {interview.error}
      </Alert>
    ) : (
      <Stack direction="row" gap={3} align="center">
        <Spinner label="" />
        <Text size="sm" tone="secondary">
          Opening the interview…
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap={4} data-testid="interview-panel">
      <LiveRegion message={message} />
      <Stack direction="row" gap={3} align="center" justify="between" wrap>
        {current !== null && state.phaseStartedAt !== null ? (
          <PhaseTimer phase={current} startedAt={state.phaseStartedAt} />
        ) : (
          <Text size="sm" tone="muted">
            No phase is running.
          </Text>
        )}
        {pending !== null ? (
          <Stack direction="row" gap={2} align="center" data-testid="interview-pending">
            <Spinner label="" />
            <Text size="sm" tone="secondary">
              The interviewer is answering…
            </Text>
          </Stack>
        ) : null}
      </Stack>

      {state.turns.length === 0 ? (
        <Text size="sm" tone="muted" data-testid="interview-empty">
          Nothing has been said yet. Ask what the problem leaves open; the interviewer answers from
          the notes you cannot see.
        </Text>
      ) : (
        <Turns aria-label="Transcript">
          {state.turns.map((turn) => (
            <TurnRow key={turn.id} turn={turn} answering={pending?.runId === turn.runId} />
          ))}
        </Turns>
      )}

      {interview.error !== null ? (
        <Alert tone="danger" title="The interviewer refused" data-testid="interview-error">
          {interview.error}
        </Alert>
      ) : null}

      {readOnly ? null : (
        <Stack gap={3}>
          <TextAreaField
            label="To the interviewer"
            hint={`Ask up to ${INTERVIEW_QUESTIONS_BOUND.target} questions, one per line, or answer what you were asked.`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            disabled={frozen}
            error={
              tooMany
                ? `One question per line, ${INTERVIEW_QUESTIONS_BOUND.target} at most.`
                : undefined
            }
            data-testid="interview-text"
          />
          <Stack direction="row" gap={2} wrap>
            <Button
              variant="solid"
              size="sm"
              disabled={frozen || questions.length === 0 || tooMany}
              onClick={() => void interview.ask(questions).then(() => setText(''))}
              data-testid="interview-ask"
            >
              Ask
            </Button>
            <Button
              variant="subtle"
              size="sm"
              disabled={frozen || text.trim().length === 0}
              onClick={() => void interview.answer(text.trim()).then(() => setText(''))}
              data-testid="interview-answer"
            >
              Answer
            </Button>
            {current?.advanceOn === 'advance' && next !== null ? (
              <Button
                variant="subtle"
                size="sm"
                disabled={frozen}
                onClick={() => void interview.advance()}
                data-testid="interview-advance"
              >
                Move on to {next.label.toLowerCase()}
              </Button>
            ) : null}
            {current?.advanceOn === 'probe' ? (
              <Button
                variant="subtle"
                size="sm"
                disabled={frozen}
                onClick={() => void interview.probe()}
                data-testid="interview-probe"
              >
                Open the deep dive
              </Button>
            ) : null}
            {current?.advanceOn === 'submit' ? (
              <Text as="span" size="sm" tone="muted" data-testid="interview-submit-hint">
                Submitting the design ends the interview.
              </Text>
            ) : null}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
