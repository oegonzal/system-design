'use client';

import styled from '@emotion/styled';
import {
  DEFAULT_IMPROVE_ITERATIONS,
  MAX_IMPROVE_ITERATIONS,
  type ImproveIterationDto,
  type ImproveRunDto,
  type LlmAvailabilityDto,
  type StopReason,
} from '@sysdesign/contracts';
import {
  Badge,
  Button,
  DECISION_TONE,
  LiveRegion,
  SelectField,
  Spinner,
  Stack,
  Text,
} from '@sysdesign/design-system';
import { useState } from 'react';

export interface ImprovementPanelProps {
  /** Output of `useImproveRunPolling` — the workspace owns the hook. */
  run: ImproveRunDto | null;
  error: string | null;
  isPolling: boolean;
  /** Announcement string from the polling hook; rendered into a LiveRegion here. */
  message: string;
  /** null while loading; the idle copy explains a disabled coach honestly. */
  availability: LlmAvailabilityDto | null;
  /** True while the draft is being posted, before a run id exists. */
  starting?: boolean;
  /** Nothing on the canvas — there is nothing to coach. */
  canvasEmpty?: boolean;
  onStart: (maxIterations: number) => void;
  onLoadRevision: (revisionId: string) => void;
}

const IterationRow = styled.li`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[2]}px 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
  list-style: none;
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
  'producer-unavailable': 'The coach has no model to revise with.',
};

function unavailableCopy(availability: LlmAvailabilityDto): string {
  if (availability.reason === 'deterministic') {
    return 'The coach is off in deterministic mode — set QUALITY_LOOP_DETERMINISTIC=0 to enable it.';
  }
  if (availability.reason === 'no-key') {
    return 'The coach needs a live model — set ANTHROPIC_API_KEY, or QUALITY_LOOP_AUTH=claude-code to use your Claude login.';
  }
  return 'The coach cannot reach the quality loop right now.';
}

/** The strictly-better iteration that was imported with the highest score — the one worth loading. */
function bestImported(run: ImproveRunDto): ImproveIterationDto | null {
  let best: ImproveIterationDto | null = null;
  for (const iteration of run.iterations) {
    if (iteration.iteration === 1 || iteration.revisionId === null) continue;
    if (best === null || (iteration.overall ?? -1) > (best.overall ?? -1)) best = iteration;
  }
  return best;
}

const ITERATION_OPTIONS = Array.from({ length: MAX_IMPROVE_ITERATIONS }, (_, index) => index + 1);

/**
 * The coach dock: choose how many times the loop may revise, hand it the
 * draft, and watch the iterations arrive. Iteration 1 is the author's own
 * draft, graded; every later row is one of the coach's revisions, imported
 * into the timeline when it beat everything before it. Pure props,
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
  onStart,
  onLoadRevision,
}: ImprovementPanelProps) {
  const [iterations, setIterations] = useState(DEFAULT_IMPROVE_ITERATIONS);
  const active = starting || isPolling || (run !== null && run.status === 'running');
  const unavailable = availability !== null && !availability.enabled;
  const best = run ? bestImported(run) : null;

  return (
    <Stack gap={5} data-testid="improvement-panel">
      <LiveRegion message={message} />

      <Stack gap={3}>
        <Text size="sm" tone="muted">
          Stuck, or curious how a staff engineer would take this further? The coach hands your
          canvas to the quality loop for a few revise iterations: each one is graded by the same
          lenses, and every revision that beats the last lands in your timeline as an AI revision.
          Your current draft is submitted as a revision first.
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
            title={unavailable && availability ? unavailableCopy(availability) : undefined}
            data-testid="improve-run"
          >
            {active ? 'Coaching…' : 'Improve with the coach'}
          </Button>
        </Stack>
        {unavailable && availability ? (
          <Text size="sm" tone="muted" data-testid="improver-unavailable">
            {unavailableCopy(availability)}
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
          {run.iterations.map((iteration) => (
            <IterationRow
              key={iteration.iteration}
              data-testid={`improve-iteration-${iteration.iteration}`}
            >
              <Text as="span" size="sm" tone="muted">
                #{iteration.iteration}
              </Text>
              <ScoreCell>{iteration.overall ?? '—'}</ScoreCell>
              {iteration.decision ? (
                <Badge tone={DECISION_TONE[iteration.decision]}>{iteration.decision}</Badge>
              ) : null}
              {iteration.iteration === 1 ? (
                <Badge tone="neutral">your draft</Badge>
              ) : iteration.revisionId !== null ? (
                <Badge tone="success">imported</Badge>
              ) : (
                <Badge tone="neutral">not better</Badge>
              )}
            </IterationRow>
          ))}
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
