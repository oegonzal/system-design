'use client';

import {
  regradable,
  type EvaluationDto,
  type EvaluationFindingDto,
  type RunHeartbeatDto,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import {
  Alert,
  Badge,
  Button,
  Heading,
  LiveRegion,
  Spinner,
  Stack,
  Text,
} from '@sysdesign/design-system';

import { CriterionResultsList } from './criterion-results-list';
import { FailureDetail } from './failure-detail';
import { OFF_CANVAS_COPY, type FeedbackSubject } from './feedback-subject';
import { FindingsList } from './findings-list';
import { SILENCE_BODY, silenceCopy, useLiveness } from './liveness';
import { ScoreSummary } from './score-summary';
import { unscoredNote } from './unscored';

/**
 * Why a revision on show has no grade to poll: `never` — it was stored before
 * grading moved to the quality loop, so no run was ever started for it;
 * `lost` — a run was, and the grader no longer has it.
 */
export const UNGRADED_REASONS = ['never', 'lost'] as const;
export type UngradedReason = (typeof UNGRADED_REASONS)[number];

export interface EvaluationPanelProps {
  /** The revision the feedback is about; null before anything was submitted. */
  subject?: FeedbackSubject | null;
  /** Output of `useEvaluationPolling` — the workspace owns the hook. */
  evaluation: EvaluationDto | null;
  /** The failed run's own error, verbatim — the operator's line, shown folded under the author's. */
  error: string | null;
  isPolling: boolean;
  /** Announcement string from the polling hook; rendered into a LiveRegion here. */
  message: string;
  /** The prompt's rubric, so criterion ids read as statements. */
  criteria: SuccessCriterion[];
  /** Why the loaded revision has no grade to show; null when it has one, or is waiting for it. */
  ungraded?: UngradedReason | null;
  /**
   * When the grade on show started, as far as the page knows — when the
   * revision was stored, or when this tab sent it to be graded again. The
   * run's own start, once the poll has read it, is what the clock counts
   * from; this stands in until then.
   */
  startedAt?: string | null;
  /**
   * The pace the grader's runs keep, as the loop reports it — what a quiet
   * grade is judged by. Null until the page knows it, and then no silence is
   * claimed.
   */
  heartbeat?: RunHeartbeatDto | null;
  /**
   * Grade the revision on show again, in place: the same revision, a fresh
   * run of its stored design — never a second revision with the same content.
   */
  onRegrade: () => void;
  /** True while that request is on its way. */
  regrading?: boolean;
  /**
   * Why the session takes no grade right now — a run holds its slot, its
   * prompt is archived. Disables the grade-again control and is its title.
   */
  regradeBlockedReason?: string | null;
  onSelectFinding: (finding: EvaluationFindingDto) => void;
}

/** A revision with no grade to show, to its author: why, and that grading it changes nothing else. */
const UNGRADED_COPY: Record<UngradedReason, string> = {
  never:
    'This revision was stored before grading moved to the quality loop, so it was never graded. Grade it now — the revision stays as it is.',
  lost: 'The grader no longer has this revision’s grade. Grade it again — the revision stays as it is.',
};

/**
 * A grade that failed, to its author: what happened to the revision. The
 * run's own error is the operator's line, shown folded under it
 * (`FailureDetail`).
 */
const FAILED_COPY = {
  title: 'Grading stopped unexpectedly',
  body: 'This revision was not graded. Grade it again — the revision stays as it is.',
} as const;

/** What a wait costs: several lenses read the design, each a model call. */
const DURATION_HINT = 'Grading usually takes a few minutes';

/**
 * The feedback dock: first whose feedback it is — the revision by number,
 * and a line when the canvas has moved on to the draft — then running →
 * spinner with how long it usually takes and how long it has taken, counted
 * from the run's own start, and a warning once the run has gone quiet past
 * the loop's own pace rather than a spinner that says nothing, failed →
 * what happened in the author's terms, the
 * run's own error one click down, and the way back, complete → the score
 * summary, the criterion results and the findings. A grade that earned no
 * score says so in place of the summary — why, and never a 0 or a decision
 * that would read as a verdict — before showing what the lenses did find; a
 * revision with no grade to show says why in place of the idle copy. The way
 * back from a grade that failed, was lost, never ran or could not be settled
 * is the same one: grade this revision again, where it stands. The
 * LiveRegion is mounted unconditionally so status changes are announced,
 * not just rendered.
 */
export function EvaluationPanel({
  subject = null,
  evaluation,
  error,
  isPolling,
  message,
  criteria,
  ungraded = null,
  startedAt = null,
  heartbeat = null,
  onRegrade,
  regrading = false,
  regradeBlockedReason = null,
  onSelectFinding,
}: EvaluationPanelProps) {
  const status = evaluation?.status ?? null;
  const running =
    (status === 'running' || (evaluation === null && isPolling)) &&
    error === null &&
    ungraded === null;
  const { elapsed, silentMinutes } = useLiveness(
    {
      startedAt: evaluation?.startedAt ?? startedAt,
      heartbeatAt: evaluation?.heartbeatAt ?? null,
      readAt: evaluation?.readAt ?? null,
    },
    running,
    heartbeat,
  );
  const unscored = status === 'complete' && evaluation ? unscoredNote(evaluation) : null;

  const regrade = (label: string) => (
    <Button
      variant="subtle"
      onClick={onRegrade}
      disabled={regrading || regradeBlockedReason !== null}
      title={regradeBlockedReason ?? undefined}
      data-testid="retry-evaluation"
    >
      {regrading ? 'Sending it to the grader…' : label}
    </Button>
  );

  return (
    <Stack gap={5} data-testid="evaluation-panel">
      <LiveRegion message={message} />

      {subject !== null ? (
        <Stack gap={1} data-testid="feedback-subject" data-on-canvas={subject.onCanvas}>
          <Stack direction="row" gap={2} align="center" wrap>
            <Text as="span" size="sm" tone="secondary">
              Feedback for revision #{subject.revisionNumber}
            </Text>
            {subject.origin === 'assistant' ? <Badge tone="accent">AI</Badge> : null}
          </Stack>
          {!subject.onCanvas ? (
            <Text size="sm" tone="muted" data-testid="feedback-off-canvas">
              {OFF_CANVAS_COPY}
            </Text>
          ) : null}
        </Stack>
      ) : null}

      {ungraded !== null ? (
        <Stack gap={3} data-testid="evaluation-ungraded" data-reason={ungraded}>
          <Text size="sm">{UNGRADED_COPY[ungraded]}</Text>
          <div>{regrade('Grade this revision')}</div>
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
          {silentMinutes !== null ? (
            <Alert
              tone="warn"
              title={silenceCopy(silentMinutes)}
              data-testid="grading-silence"
              data-minutes={silentMinutes}
            >
              {SILENCE_BODY}
            </Alert>
          ) : null}
        </Stack>
      ) : null}

      {error !== null ? (
        <Alert tone="danger" title={FAILED_COPY.title} data-testid="evaluation-error">
          <Stack gap={3} align="start">
            <span>{FAILED_COPY.body}</span>
            <FailureDetail detail={error} />
            {regrade('Grade this revision again')}
          </Stack>
        </Alert>
      ) : null}

      {status === 'complete' && evaluation ? (
        <>
          {unscored !== null ? (
            <Alert
              tone="warn"
              title={unscored.title}
              data-testid="evaluation-unscored"
              data-reason={evaluation.unscored ?? undefined}
            >
              <Stack gap={3} align="start">
                <span>{unscored.body}</span>
                {regradable(evaluation) ? regrade('Grade this revision again') : null}
              </Stack>
            </Alert>
          ) : (
            <ScoreSummary evaluation={evaluation} criteria={criteria} />
          )}
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
