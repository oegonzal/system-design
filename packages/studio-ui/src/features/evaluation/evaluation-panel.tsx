'use client';

import type { EvaluationDto, EvaluationFindingDto, SuccessCriterion } from '@sysdesign/contracts';
import { Button, Heading, LiveRegion, Spinner, Stack, Text } from '@sysdesign/design-system';

import { CriterionResultsTable } from './criterion-results-table';
import { FindingsList } from './findings-list';
import { ScoreSummary } from './score-summary';

export interface EvaluationPanelProps {
  /** Output of `useEvaluationPolling` — the workspace owns the hook. */
  evaluation: EvaluationDto | null;
  error: string | null;
  isPolling: boolean;
  /** Announcement string from the polling hook; rendered into a LiveRegion here. */
  message: string;
  /** The prompt's rubric, so criterion ids read as statements. */
  criteria: SuccessCriterion[];
  /** There is no retry endpoint: retrying a failed grade is resubmitting the draft. */
  onRetry: () => void;
  onSelectFinding: (finding: EvaluationFindingDto) => void;
}

/** An escalation without a score: the lenses could not reach a verdict. */
const ESCALATED_COPY =
  'The quality loop escalated this design without a score — its lenses could not reach a verdict.';

/**
 * The feedback dock: running → spinner, failed → error + resubmit, complete →
 * the score summary, the criterion results and the findings. An escalation
 * with no score says why before showing what the lenses did find. The
 * LiveRegion is mounted unconditionally so status changes are announced,
 * not just rendered.
 */
export function EvaluationPanel({
  evaluation,
  error,
  isPolling,
  message,
  criteria,
  onRetry,
  onSelectFinding,
}: EvaluationPanelProps) {
  const status = evaluation?.status ?? null;
  const escalated =
    evaluation !== null &&
    evaluation.status === 'complete' &&
    evaluation.decision === 'escalate' &&
    evaluation.overall === null;

  return (
    <Stack gap={5} data-testid="evaluation-panel">
      <LiveRegion message={message} />

      {evaluation === null && error === null && !isPolling ? (
        <Text size="sm" tone="muted">
          Submit your design to have the quality loop grade it.
        </Text>
      ) : null}

      {(status === 'running' || (evaluation === null && isPolling)) && error === null ? (
        <Stack direction="row" gap={3} align="center">
          <Spinner label="" />
          <Text size="sm" tone="secondary">
            The lenses are reading your design…
          </Text>
        </Stack>
      ) : null}

      {error !== null ? (
        <Stack gap={3} data-testid="evaluation-error">
          <Text size="sm">{error}</Text>
          <div>
            <Button variant="subtle" onClick={onRetry} data-testid="retry-evaluation">
              Resubmit for grading
            </Button>
          </div>
        </Stack>
      ) : null}

      {status === 'complete' && evaluation ? (
        <>
          {escalated ? (
            <Text size="sm" tone="secondary" data-testid="evaluation-escalated">
              {ESCALATED_COPY}
            </Text>
          ) : null}
          <ScoreSummary evaluation={evaluation} />
          <Stack gap={2}>
            <Heading level={3}>Criteria</Heading>
            <CriterionResultsTable results={evaluation.criterionResults} criteria={criteria} />
          </Stack>
          <Stack gap={2}>
            <Heading level={3}>Findings</Heading>
            <FindingsList
              findings={evaluation.findings}
              criteria={criteria}
              onSelect={onSelectFinding}
            />
          </Stack>
        </>
      ) : null}
    </Stack>
  );
}
