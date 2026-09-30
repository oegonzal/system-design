'use client';

import styled from '@emotion/styled';
import {
  DEFAULT_IMPROVE_ITERATIONS,
  MAX_IMPROVE_ITERATIONS,
  type ImproveIterationDto,
  type ImproveIterationOutcome,
  type ImproveRunDto,
  type StopReason,
} from '@sysdesign/contracts';
import {
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
  escalated: 'The coach escalated — the loop could not score this design.',
  plateau: 'The coach plateaued — its last revisions stopped improving the score.',
  'max-iterations': 'The coach used its iteration budget.',
};

/** A booted loop always has a model, so the grader is only ever "unreachable"; the prompt may also be archived. */
const UNREACHABLE_COPY = 'The coach cannot reach the quality loop right now.';
const ARCHIVED_COPY = 'This prompt is archived — reactivate it to keep practising.';

/** What became of each iteration in the studio, as a chip. Every outcome the contract names. */
const OUTCOME_CHIP: Record<ImproveIterationOutcome, { tone: BadgeTone; label: string }> = {
  base: { tone: 'neutral', label: 'starting point' },
  imported: { tone: 'success', label: 'imported' },
  'not-better': { tone: 'neutral', label: 'not better' },
  refused: { tone: 'critical', label: 'refused' },
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

const ITERATION_OPTIONS = Array.from({ length: MAX_IMPROVE_ITERATIONS }, (_, index) => index + 1);

/**
 * The coach dock: choose how many times the loop may revise, hand it a
 * starting point, and watch the iterations arrive. Iteration 1 is the
 * starting point — the author's draft graded, or a graded revision whose
 * grade the loop adopted; every later row is one of the coach's revisions,
 * imported into the timeline when it beat everything before it, left where
 * it was when it did not, or refused when the studio would not store it.
 * Each row says why the controller decided as it did. Pure props,
 * Storybook-safe; the workspace owns polling and the load-revision flow.
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
  onStart,
  onLoadRevision,
}: ImprovementPanelProps) {
  const [iterations, setIterations] = useState(DEFAULT_IMPROVE_ITERATIONS);
  const active = starting || isPolling || (run !== null && run.status === 'running');
  const unavailable = availability.status !== 'reachable' || promptArchived;
  const whyUnavailable =
    availability.status === 'unreachable'
      ? UNREACHABLE_COPY
      : promptArchived
        ? ARCHIVED_COPY
        : null;
  const best = run ? bestImported(run) : null;

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
            onChange={(event) => setIterations(Number(event.target.value))}
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
            disabled={active || unavailable || canvasEmpty}
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
          <Text size="sm" tone="secondary">
            {run !== null
              ? `Coaching — ${run.exchangeCount} model ${run.exchangeCount === 1 ? 'call' : 'calls'} so far…`
              : 'Submitting your draft to the coach…'}
          </Text>
        </Stack>
      ) : null}

      {error !== null ? (
        <Text size="sm" data-testid="improvement-error">
          {error}
        </Text>
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
                  <ScoreCell>{iteration.overall ?? '—'}</ScoreCell>
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
                  <Text as="span" size="sm" tone="muted" data-testid="improve-iteration-reason">
                    {iteration.reason}
                  </Text>
                ) : null}
                {iteration.outcome === 'refused' && iteration.problems.length > 0 ? (
                  <Text size="sm" tone="secondary" data-testid="improve-iteration-problems">
                    Not stored: {iteration.problems.join('; ')}
                  </Text>
                ) : null}
              </IterationRow>
            );
          })}
        </IterationList>
      ) : null}

      {run !== null && run.status !== 'running' ? (
        <Stack gap={3}>
          {run.stopReason ? (
            <Text size="sm" tone="secondary" data-testid="improvement-stopped">
              {STOPPED_COPY[run.stopReason]}
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
        </Stack>
      ) : null}
    </Stack>
  );
}
