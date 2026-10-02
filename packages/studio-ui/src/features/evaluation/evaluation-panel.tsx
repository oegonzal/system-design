'use client';

import type {
  EvaluationDto,
  EvaluationFindingDto,
  RevisionOrigin,
  SuccessCriterion,
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
import { useElapsed } from './elapsed';
import { FailureDetail } from './failure-detail';
import { FindingsList } from './findings-list';
import { ScoreSummary } from './score-summary';

/**
 * Why a revision on show has no grade to poll: `never` — it was stored before
 * grading moved to the quality loop, so no run was ever started for it;
 * `lost` — a run was, and the grader no longer has it.
 */
export const UNGRADED_REASONS = ['never', 'lost'] as const;
export type UngradedReason = (typeof UNGRADED_REASONS)[number];

/**
 * Whose feedback the tab shows. The feedback follows a revision; the canvas
 * may have moved on to the draft — a revision restored as the draft, a
 * session opened on a saved one — and the tab says so rather than let a
 * score read as the verdict on what is drawn now.
 */
export interface FeedbackSubject {
  revisionNumber: number;
  origin: RevisionOrigin;
  /** Whether the canvas shows this revision as it was graded; false once it shows the draft. */
  onCanvas: boolean;
}

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
  /** When the grade on show started; the running state counts from it. */
  startedAt?: string | null;
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

/** What the tab says when the canvas no longer shows the revision its feedback is about. */
const OFF_CANVAS_COPY = 'The canvas shows your draft, not this revision.';

/** An escalation without a score: the lenses could not reach a verdict. */
const ESCALATED_COPY =
  'The quality loop escalated this design without a score — its lenses could not reach a verdict.';

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
 * spinner with how long it usually takes and
 * how long it has taken, failed → what happened in the author's terms, the
 * run's own error one click down, and the way back, complete → the score
 * summary, the criterion results and the findings. An escalation with no
 * score says why before showing what the lenses did find; a revision with
 * no grade to show says why in place of the idle copy. The way back from a
 * grade that failed, was lost or never ran is the same one: grade this
 * revision again, where it stands. The LiveRegion is mounted unconditionally
 * so status changes are announced, not just rendered.
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
  const elapsed = useElapsed(startedAt, running);
  const escalated =
    evaluation !== null &&
    evaluation.status === 'complete' &&
    evaluation.decision === 'escalate' &&
    evaluation.overall === null;

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
