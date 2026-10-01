'use client';

import type { EvaluationDto, EvaluationFindingDto, SuccessCriterion } from '@sysdesign/contracts';
import { Alert, Button, Heading, LiveRegion, Spinner, Stack, Text } from '@sysdesign/design-system';

import { CriterionResultsList } from './criterion-results-list';
import { useElapsed } from './elapsed';
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
  /** The loaded revision was stored before grading was delegated — it has no evaluation to poll. */
  legacy?: boolean;
  /** When the graded revision was stored — the grade started then; the running state counts from it. */
  startedAt?: string | null;
  /** There is no retry endpoint: retrying a failed grade is resubmitting the draft. */
  onRetry: () => void;
  onSelectFinding: (finding: EvaluationFindingDto) => void;
}

/** An escalation without a score: the lenses could not reach a verdict. */
const ESCALATED_COPY =
  'The quality loop escalated this design without a score — its lenses could not reach a verdict.';

/** A revision from before grading moved to the loop: nothing to poll, only to resubmit. */
const LEGACY_COPY =
  'This revision was stored before grading moved to the quality loop, so it has no evaluation. Resubmit it to grade it.';

/** What a wait costs: several lenses read the design, each a model call. */
const DURATION_HINT = 'Grading usually takes a few minutes';

/**
 * The feedback dock: running → spinner with how long it usually takes and
 * how long it has taken, failed → the error + resubmit, complete → the score
 * summary, the criterion results and the findings. An escalation with no
 * score says why before showing what the lenses did find; a legacy revision
 * says it has nothing to show and offers the resubmit instead of the idle
 * copy. The LiveRegion is mounted unconditionally so status changes are
 * announced, not just rendered.
 */
export function EvaluationPanel({
  evaluation,
  error,
  isPolling,
  message,
  criteria,
  legacy = false,
  startedAt = null,
  onRetry,
  onSelectFinding,
}: EvaluationPanelProps) {
  const status = evaluation?.status ?? null;
  const running = (status === 'running' || (evaluation === null && isPolling)) && error === null;
  const elapsed = useElapsed(startedAt, running);
  const escalated =
    evaluation !== null &&
    evaluation.status === 'complete' &&
    evaluation.decision === 'escalate' &&
    evaluation.overall === null;

  return (
    <Stack gap={5} data-testid="evaluation-panel">
      <LiveRegion message={message} />

      {legacy ? (
        <Stack gap={3} data-testid="evaluation-legacy">
          <Text size="sm">{LEGACY_COPY}</Text>
          <div>
            <Button variant="subtle" onClick={onRetry} data-testid="retry-evaluation">
              Resubmit for grading
            </Button>
          </div>
        </Stack>
      ) : evaluation === null && error === null && !isPolling ? (
        <Text size="sm" tone="muted">
          Submit your design to have the quality loop grade it.
        </Text>
      ) : null}

      {running ? (
        <Stack gap={2}>
          <Stack direction="row" gap={3} align="center">
            <Spinner label="" />
            <Text size="sm" tone="secondary">
              The lenses are reading your design…
            </Text>
          </Stack>
          <Text size="sm" tone="muted" data-testid="grading-duration">
            {elapsed !== null ? `${DURATION_HINT} — ${elapsed} so far.` : `${DURATION_HINT}.`}
          </Text>
        </Stack>
      ) : null}

      {error !== null ? (
        <Alert tone="danger" title="Grading failed" data-testid="evaluation-error">
          <Stack gap={3} align="start">
            <span>{error}</span>
            <Button variant="subtle" onClick={onRetry} data-testid="retry-evaluation">
              Resubmit for grading
            </Button>
          </Stack>
        </Alert>
      ) : null}

      {status === 'complete' && evaluation ? (
        <>
          {escalated ? (
            <Text size="sm" tone="secondary" data-testid="evaluation-escalated">
              {ESCALATED_COPY}
            </Text>
          ) : null}
          <ScoreSummary evaluation={evaluation} criteria={criteria} />
          <Stack gap={2}>
            <Heading level={3}>Criteria</Heading>
            <CriterionResultsList results={evaluation.criterionResults} criteria={criteria} />
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
