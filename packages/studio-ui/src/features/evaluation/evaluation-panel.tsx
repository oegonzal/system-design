'use client';

import type { EvaluationDto, FindingDto } from '@sysdesign/contracts';
import { Button, LiveRegion, Spinner, Stack, Text } from '@sysdesign/design-system';

import { FindingsList } from './findings-list';
import { ScoreSummary } from './score-summary';
import { SuggestionControls } from './suggestion-controls';

export interface EvaluationPanelProps {
  /** Output of `useEvaluationPolling` — the workspace owns the hook. */
  evaluation: EvaluationDto | null;
  error: string | null;
  isPolling: boolean;
  /** Announcement string from the polling hook; rendered into a LiveRegion here. */
  message: string;
  onRetry: () => void;
  onSelectFinding: (finding: FindingDto) => void;
  onPreviewFix: (finding: FindingDto) => void;
}

/**
 * The feedback dock: queued/running → spinner, failed → error + retry,
 * complete → score summary and the findings list. The LiveRegion is mounted
 * unconditionally so status changes are announced, not just rendered.
 */
export function EvaluationPanel({
  evaluation,
  error,
  isPolling,
  message,
  onRetry,
  onSelectFinding,
  onPreviewFix,
}: EvaluationPanelProps) {
  const status = evaluation?.status ?? null;

  return (
    <Stack gap={5} data-testid="evaluation-panel">
      <LiveRegion message={message} />

      {evaluation === null && error === null && !isPolling ? (
        <Text size="sm" tone="muted">
          Submit your design to get graded feedback.
        </Text>
      ) : null}

      {(status === 'queued' || status === 'running' || (evaluation === null && isPolling)) &&
      error === null ? (
        <Stack direction="row" gap={3} align="center">
          <Spinner label="" />
          <Text size="sm" tone="secondary">
            {status === 'running'
              ? 'The critic pipeline is grading your design…'
              : 'Waiting for the evaluation worker…'}
          </Text>
        </Stack>
      ) : null}

      {error !== null ? (
        <Stack gap={3} data-testid="evaluation-error">
          <Text size="sm">{error}</Text>
          <div>
            <Button variant="subtle" onClick={onRetry} data-testid="retry-evaluation">
              Retry evaluation
            </Button>
          </div>
        </Stack>
      ) : null}

      {status === 'complete' && evaluation ? (
        <>
          <ScoreSummary evaluation={evaluation} />
          <SuggestionControls />
          <FindingsList
            findings={evaluation.findings}
            onSelect={onSelectFinding}
            onPreviewFix={onPreviewFix}
          />
        </>
      ) : null}
    </Stack>
  );
}
