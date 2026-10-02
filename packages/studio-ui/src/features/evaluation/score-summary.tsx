'use client';

import styled from '@emotion/styled';
import type { EvaluationDto, SuccessCriterion } from '@sysdesign/contracts';
import { Badge, DECISION_TONE, Meter, Stack, Text } from '@sysdesign/design-system';

import { decisionInWords } from './decision-reason';
import { degradedNote } from './degraded';
import { humanizeToken } from './humanize';
import { formatScore } from './score';
import { STOPPED_COPY } from './stop-reason';
import { WrappingText } from './wrapping-text';

const ScoreRow = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[4]}px;
`;

const BigScore = styled.span`
  font-size: 40px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1;
  color: ${({ theme }) => theme.color.text.primary};
  font-variant-numeric: tabular-nums;
`;

/** Mirrors the Meter's label row so assessed and unassessed rows align. */
const NotAssessedRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]}px;
`;

const NO_CRITERIA: SuccessCriterion[] = [];

export interface ScoreSummaryProps {
  evaluation: EvaluationDto;
  /** The prompt's rubric, so a criterion the decision cites reads as its statement. */
  criteria?: SuccessCriterion[];
}

/**
 * The headline of a grade with a score: the controller's overall score, its
 * decision and why, in the reader's words (`decisionInWords`) — every
 * finding and criterion it cites named as the record names it — why the
 * coach stopped when this grade is the one that ended its run (a plain grade
 * carries no stop reason, and nothing is shown), which lens samples the grade
 * was computed without, and one meter per dimension the pipeline declared.
 * The dimension names are the pipeline's own — whatever keys arrive are what
 * render, in the order the loop reported them. A grade that earned no score
 * is not one to headline: the panel says why in its place. Purely
 * presentational — Storybook-safe.
 */
export function ScoreSummary({ evaluation, criteria = NO_CRITERIA }: ScoreSummaryProps) {
  const dimensions = Object.entries(evaluation.dimensions);
  const degraded = degradedNote(evaluation.degraded);
  const reason = decisionInWords(
    {
      decision: evaluation.decision,
      reason: evaluation.decisionReason,
      basis: evaluation.decisionBasis,
    },
    { findings: evaluation.findings, criteria },
  );

  return (
    <Stack gap={5} data-testid="score-summary">
      <ScoreRow>
        <BigScore data-testid="overall-score">{formatScore(evaluation.overall)}</BigScore>
        <Text as="span" size="sm" tone="muted">
          / 100
        </Text>
        {evaluation.decision ? (
          <Badge tone={DECISION_TONE[evaluation.decision]} data-testid="decision-badge">
            {evaluation.decision}
          </Badge>
        ) : null}
      </ScoreRow>
      {reason ? (
        <WrappingText size="sm" tone="muted" data-testid="decision-reason">
          {reason}
        </WrappingText>
      ) : null}
      {evaluation.stopReason ? (
        <WrappingText size="sm" tone="muted" data-testid="stop-reason">
          {STOPPED_COPY[evaluation.stopReason]}
        </WrappingText>
      ) : null}
      {degraded !== null ? (
        <WrappingText size="sm" tone="muted" data-testid="degraded-note">
          {degraded}
        </WrappingText>
      ) : null}
      {dimensions.length > 0 ? (
        <Stack gap={3}>
          {dimensions.map(([key, value]) =>
            // Null = the loop never assessed this dimension — no meter, no
            // value, so a screen reader hears nothing measurable.
            value === null ? (
              <NotAssessedRow key={key} data-testid={`not-assessed-${key}`}>
                <Text as="span" size="sm" tone="muted">
                  {humanizeToken(key)}
                </Text>
                <Text as="span" size="sm" tone="muted">
                  Not assessed
                </Text>
              </NotAssessedRow>
            ) : (
              <Meter
                key={key}
                label={humanizeToken(key)}
                value={value}
                formatValue={formatScore}
                data-dimension={key}
              />
            ),
          )}
        </Stack>
      ) : null}
    </Stack>
  );
}
