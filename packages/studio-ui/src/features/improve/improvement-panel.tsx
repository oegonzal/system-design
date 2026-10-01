'use client';

import styled from '@emotion/styled';
import {
  DEFAULT_IMPROVE_ITERATIONS,
  MAX_IMPROVE_ITERATIONS,
  PROMPT_COPY,
  type DesignRevisionSummaryDto,
  type ImproveIterationDto,
  type ImproveIterationOutcome,
  type ImproveRunDto,
  type StopReason,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import {
  Alert,
  Badge,
  type BadgeTone,
  Button,
  DECISION_TONE,
  LiveRegion,
  SelectField,
  Spinner,
  Stack,
  Text,
} from '@sysdesign/design-system';
import { useState } from 'react';

import { humanizeReason } from '../evaluation/decision-reason';
import { formatScore } from '../evaluation/score';
import { WrappingText } from '../evaluation/wrapping-text';
import { coachProgress } from './coach-progress';
import type { GraderAvailability } from './grader-availability';

export interface ImprovementPanelProps {
  /** Output of `useImproveRunPolling` — the workspace owns the hook. */
  run: ImproveRunDto | null;
  error: string | null;
  isPolling: boolean;
  /** Announcement string from the polling hook; rendered into a LiveRegion here. */
  message: string;
  /** null while loading; the idle copy explains a disabled coach honestly. */
  availability: GraderAvailability;
  /** True while the draft is being posted, before a run id exists. */
  starting?: boolean;
  /** Nothing on the canvas — there is nothing to coach. */
  canvasEmpty?: boolean;
  /** The session's prompt is archived: the studio refuses new work on it until it is back. */
  promptArchived?: boolean;
  /**
   * Why the session takes no coach start right now — a run already holds its
   * grading slot (`describeInFlight`). Disables the start and says why.
   */
  blockedReason?: string | null;
  /** The prompt's rubric, so a criterion a reason cites reads as its statement. */
  criteria?: SuccessCriterion[];
  /**
   * The best revision an earlier coaching run left — offered when the run on
   * screen left none of its own, so a failed run never hides the last good one.
   */
  earlierBest?: DesignRevisionSummaryDto | null;
  onStart: (maxIterations: number) => void;
  onLoadRevision: (revisionId: string) => void;
}

const IterationRow = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]}px;
  padding: ${({ theme }) => theme.space[2]}px 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
  list-style: none;
`;

const IterationLine = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[3]}px;
`;

const IterationList = styled.ul`
  margin: 0;
  padding: 0;
`;

const ScoreCell = styled.span`
  font-variant-numeric: tabular-nums;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.text.primary};
  min-width: 3.5em;
`;

/** Why the loop stopped, in the author's terms. Every reason the contract names. */
const STOPPED_COPY: Record<StopReason, string> = {
  accepted: 'The coach reached a design the loop accepts.',
  rejected: 'The coach rejected the design outright — its revisions could not lift it.',
  escalated:
    'The coach stopped and escalated — the loop needs a person to judge what its last revision left open.',
  plateau: 'The coach plateaued — its last revisions stopped improving the score.',
  'max-iterations': 'The coach used its iteration budget.',
};

/**
 * What the last iteration's outcome says about the stop, when it says more
 * than the stop reason: a coach that produced nothing to judge is the
 * coach's miss, never a verdict on the author's design. Read ahead of
 * `STOPPED_COPY`.
 */
const STOPPED_BY_OUTCOME: Partial<Record<ImproveIterationOutcome, string>> = {
  'no-artifact': 'The coach could not produce a revision this time — try again.',
};

/** A booted loop always has a model, so the grader is only ever "unreachable". */
const UNREACHABLE_COPY = 'The coach cannot reach the quality loop right now.';

/** What became of each iteration in the studio, as a chip. Every outcome the contract names. */
const OUTCOME_CHIP: Record<ImproveIterationOutcome, { tone: BadgeTone; label: string }> = {
  base: { tone: 'neutral', label: 'starting point' },
  imported: { tone: 'success', label: 'imported' },
  'not-better': { tone: 'neutral', label: 'not better' },
  refused: { tone: 'critical', label: 'refused' },
  'no-artifact': { tone: 'neutral', label: 'no revision produced' },
};

/** The imported iteration with the highest score — the one worth loading. */
function bestImported(run: ImproveRunDto): ImproveIterationDto | null {
  let best: ImproveIterationDto | null = null;
  for (const iteration of run.iterations) {
    if (iteration.outcome !== 'imported') continue;
    if (best === null || (iteration.overall ?? -1) > (best.overall ?? -1)) best = iteration;
  }
  return best;
}

/** Why the run stopped, from the last iteration's outcome first, then the loop's stop reason. */
function stoppedCopy(run: ImproveRunDto): string | null {
  const last = run.iterations.at(-1);
  const byOutcome = last ? STOPPED_BY_OUTCOME[last.outcome] : undefined;
  return byOutcome ?? (run.stopReason ? STOPPED_COPY[run.stopReason] : null);
}

const ITERATION_OPTIONS = Array.from({ length: MAX_IMPROVE_ITERATIONS }, (_, index) => index + 1);

/**
 * The coach dock: choose how many times the loop may revise, hand it a
 * starting point, and watch the iterations arrive. Iteration 1 is the
 * starting point — the author's draft graded, or a graded revision whose
 * grade the loop adopted; every later row is one of the coach's revisions,
 * imported into the timeline when it beat everything before it, left where
 * it was when it did not, refused when the studio would not store it, or
 * missing when the coach produced nothing. Each row says why the controller
 * decided as it did, naming the findings and criteria it cites the way the
 * feedback summary names them — from the iteration's own findings, placed
 * on the design it judged. The iteration count
 * reads the run's own budget while there is a run, and the author's choice
 * for the next one. Pure props, Storybook-safe; the workspace owns polling
 * and the load-revision flow.
 */
export function ImprovementPanel({
  run,
  error,
  isPolling,
  message,
  availability,
  starting = false,
  canvasEmpty = false,
  promptArchived = false,
  blockedReason = null,
  criteria,
  earlierBest = null,
  onStart,
  onLoadRevision,
}: ImprovementPanelProps) {
  const [chosen, setChosen] = useState<number | null>(null);
  const live = run !== null && run.status === 'running';
  const active = starting || isPolling || live;
  // A live run's budget is what it is; otherwise the author's pick, or the last run's.
  const iterations = live
    ? run.maxIterations
    : (chosen ?? run?.maxIterations ?? DEFAULT_IMPROVE_ITERATIONS);
  const unavailable = availability.status !== 'reachable' || promptArchived;
  const whyUnavailable =
    availability.status === 'unreachable'
      ? UNREACHABLE_COPY
      : promptArchived
        ? PROMPT_COPY.archived
        : active
          ? null
          : blockedReason;
  const best = run ? bestImported(run) : null;
  const ended = run !== null && !live;
  const stopped = run !== null && ended ? stoppedCopy(run) : null;
  const fallback = ended && best === null ? earlierBest : null;

  return (
    <Stack gap={5} data-testid="improvement-panel">
      <LiveRegion message={message} />

      <Stack gap={3}>
        <Text size="sm" tone="muted">
          Stuck, or curious how a staff engineer would take this further? The coach hands your
          canvas to the quality loop for a few revise iterations: each one is graded by the same
          lenses, and every revision that beats the last lands in your timeline as an AI revision.
          An edited draft is submitted as a revision first; starting from a graded revision reuses
          its grade instead of grading it again.
        </Text>
        <Stack direction="row" gap={3} align="end" wrap>
          <SelectField
            label="Iterations"
            value={String(iterations)}
            onChange={(event) => setChosen(Number(event.target.value))}
            disabled={active}
            data-testid="improve-iterations"
          >
            {ITERATION_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </SelectField>
          <Button
            variant="solid"
            onClick={() => onStart(iterations)}
            disabled={active || unavailable || canvasEmpty || blockedReason !== null}
            title={whyUnavailable ?? undefined}
            data-testid="improve-run"
          >
            {active ? 'Coaching…' : 'Improve with the coach'}
          </Button>
        </Stack>
        {whyUnavailable !== null ? (
          <Text size="sm" tone="muted" data-testid="improver-unavailable">
            {whyUnavailable}
          </Text>
        ) : null}
      </Stack>

      {active ? (
        <Stack direction="row" gap={3} align="center">
          <Spinner label="" />
          <Text size="sm" tone="secondary" data-testid="improve-progress">
            {run !== null ? `${coachProgress(run)}…` : 'Submitting your draft to the coach…'}
          </Text>
        </Stack>
      ) : null}

      {error !== null ? (
        <Alert tone="danger" title="The coach run failed" data-testid="improvement-error">
          {error}
        </Alert>
      ) : null}

      {run !== null && run.iterations.length > 0 ? (
        <IterationList data-testid="improvement-trajectory">
          {run.iterations.map((iteration) => {
            const chip = OUTCOME_CHIP[iteration.outcome];
            return (
              <IterationRow
                key={iteration.iteration}
                data-testid={`improve-iteration-${iteration.iteration}`}
                data-outcome={iteration.outcome}
              >
                <IterationLine>
                  <Text as="span" size="sm" tone="muted">
                    #{iteration.iteration}
                  </Text>
                  <ScoreCell>{formatScore(iteration.overall)}</ScoreCell>
                  {iteration.decision ? (
                    <Badge tone={DECISION_TONE[iteration.decision]}>{iteration.decision}</Badge>
                  ) : null}
                  <Badge tone={chip.tone}>{chip.label}</Badge>
                  {iteration.mode === 'adopted' ? (
                    <Badge tone="neutral" data-testid="improve-iteration-adopted">
                      grade reused
                    </Badge>
                  ) : null}
                </IterationLine>
                {iteration.reason !== null ? (
                  <WrappingText
                    as="span"
                    size="sm"
                    tone="muted"
                    data-testid="improve-iteration-reason"
                  >
                    {humanizeReason(iteration.reason, { findings: iteration.findings, criteria })}
                  </WrappingText>
                ) : null}
                {iteration.outcome === 'refused' && iteration.problems.length > 0 ? (
                  <WrappingText size="sm" tone="secondary" data-testid="improve-iteration-problems">
                    Not stored: {iteration.problems.join('; ')}
                  </WrappingText>
                ) : null}
              </IterationRow>
            );
          })}
        </IterationList>
      ) : null}

      {ended ? (
        <Stack gap={3}>
          {stopped !== null ? (
            <Text size="sm" tone="secondary" data-testid="improvement-stopped">
              {stopped}
            </Text>
          ) : null}
          {best !== null && best.revisionId !== null ? (
            <div>
              <Button
                variant="solid"
                onClick={() => onLoadRevision(best.revisionId as string)}
                data-testid="load-best-revision"
              >
                Load improved design
              </Button>
            </div>
          ) : null}
          {fallback !== null ? (
            <Stack gap={2} align="start" data-testid="earlier-best">
              <Text size="sm" tone="secondary">
                {`This run left no better design. The previous coaching run's best is revision #${fallback.revisionNumber}${
                  fallback.evaluation?.overall != null
                    ? `, scored ${formatScore(fallback.evaluation.overall)}`
                    : ''
                }.`}
              </Text>
              <Button
                variant="subtle"
                onClick={() => onLoadRevision(fallback.id)}
                data-testid="load-earlier-best"
              >
                Load revision #{fallback.revisionNumber}
              </Button>
            </Stack>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
