'use client';

import styled from '@emotion/styled';
import type {
  ImprovementIteration,
  ImprovementRunDto,
  LlmAvailabilityDto,
} from '@sysdesign/contracts';
import { Badge, Button, LiveRegion, Spinner, Stack, Text } from '@sysdesign/design-system';

export interface ImprovementPanelProps {
  /** Output of `useImprovementRunPolling` — the workspace owns the hook. */
  run: ImprovementRunDto | null;
  error: string | null;
  isPolling: boolean;
  /** Announcement string from the polling hook; rendered into a LiveRegion here. */
  message: string;
  /** null while loading; the idle copy explains a disabled coach honestly. */
  availability: LlmAvailabilityDto | null;
  onCancel: () => void;
  onLoadRevision: (revisionId: string) => void;
}

const IterationRow = styled.li`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[2]}px 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
  list-style: none;
`;

const IterationList = styled.ul`
  margin: 0;
  padding: 0;
`;

const ScoreCell = styled.span<{ $accepted: boolean }>`
  font-variant-numeric: tabular-nums;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme, $accepted }) =>
    $accepted ? theme.color.text.primary : theme.color.text.muted};
  min-width: 3.5em;
`;

const STOPPED_COPY: Record<string, string> = {
  perfect: 'The coach reached a perfect score.',
  plateau: 'The coach plateaued — its last proposals stopped improving the score.',
  'max-iterations': 'The coach used its iteration budget.',
  cancelled: 'You stopped the coach. Accepted improvements are kept.',
  'already-clean': 'Nothing above info-level to fix — this design is already clean.',
  'llm-unavailable': 'The coach lost its model mid-run. Check the worker environment.',
};

function bestAccepted(run: ImprovementRunDto): ImprovementIteration | null {
  const accepted = run.iterations.filter((iteration) => iteration.accepted);
  return accepted.length > 0 ? accepted[accepted.length - 1] : null;
}

/**
 * The coach dock: the live trajectory of a background improvement run.
 * Iteration 0 is the author's own baseline; every later row is one proposal —
 * accepted rows carry the score they were persisted at, rejected rows show
 * why they never became revisions. Pure props, Storybook-safe; the workspace
 * owns polling and the load-revision flow.
 */
export function ImprovementPanel({
  run,
  error,
  isPolling,
  message,
  availability,
  onCancel,
  onLoadRevision,
}: ImprovementPanelProps) {
  const active = run !== null && (run.status === 'queued' || run.status === 'running');
  const best = run ? bestAccepted(run) : null;
  const improved = best !== null && best.revisionId !== null && best.iteration > 0;

  return (
    <Stack gap={5} data-testid="improvement-panel">
      <LiveRegion message={message} />

      {run === null && error === null && !isPolling ? (
        <Stack gap={3}>
          <Text size="sm" tone="muted">
            Stuck, or curious how a model would take this further? Improve with AI hands your
            current canvas to a background coach: it proposes one change at a time, re-grades every
            candidate with the same deterministic engine, and keeps only strict improvements — each
            one lands in your timeline as an AI revision.
          </Text>
          {availability !== null && !availability.enabled ? (
            <Text size="sm" tone="muted" data-testid="improver-unavailable">
              {availability.reason === 'deterministic'
                ? 'The coach is off in deterministic mode — set IMPROVER_DETERMINISTIC=0 to enable it.'
                : 'The coach needs a live model — set ANTHROPIC_API_KEY, or IMPROVER_AUTH=claude-code to use your Claude login.'}
            </Text>
          ) : null}
        </Stack>
      ) : null}

      {active ? (
        <Stack direction="row" gap={3} align="center">
          <Spinner label="" />
          <Text size="sm" tone="secondary">
            {run.status === 'running'
              ? `Coaching — iteration ${run.iterations[run.iterations.length - 1]?.iteration ?? 0} of ${run.maxIterations}…`
              : 'Waiting for the improvement worker…'}
          </Text>
          <Button variant="subtle" onClick={onCancel} data-testid="cancel-improvement">
            Stop
          </Button>
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
              <ScoreCell $accepted={iteration.accepted}>{iteration.score}</ScoreCell>
              <Text size="sm" tone={iteration.accepted ? 'primary' : 'muted'}>
                {iteration.description}
              </Text>
              {iteration.accepted ? (
                iteration.iteration === 0 ? (
                  <Badge tone="neutral">baseline</Badge>
                ) : (
                  <Badge tone="success">accepted</Badge>
                )
              ) : (
                <Badge tone="neutral">
                  {iteration.rejectedReason === 'not-better'
                    ? 'not better'
                    : iteration.rejectedReason === 'invalid'
                      ? 'invalid'
                      : 'no proposal'}
                </Badge>
              )}
            </IterationRow>
          ))}
        </IterationList>
      ) : null}

      {run !== null && !active ? (
        <Stack gap={3}>
          {run.stoppedReason ? (
            <Text size="sm" tone="secondary" data-testid="improvement-stopped">
              {STOPPED_COPY[run.stoppedReason] ?? run.stoppedReason}
            </Text>
          ) : null}
          {improved && best.revisionId !== null ? (
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
