'use client';

import styled from '@emotion/styled';
import type { EvaluationDto } from '@sysdesign/contracts';
import { Badge, DECISION_TONE, Meter, Stack, Text } from '@sysdesign/design-system';

import { humanizeToken } from './humanize';

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

export interface ScoreSummaryProps {
  evaluation: EvaluationDto;
}

/**
 * The headline: the controller's overall score, its decision and the
 * controller's own sentence for it, why the loop stopped, and one meter per
 * dimension the pipeline declared. The dimension names are the pipeline's
 * own — whatever keys arrive are what render, in the order the loop reported
 * them. Purely presentational — Storybook-safe.
 */
export function ScoreSummary({ evaluation }: ScoreSummaryProps) {
  const dimensions = Object.entries(evaluation.dimensions);

  return (
    <Stack gap={5} data-testid="score-summary">
      <ScoreRow>
        <BigScore data-testid="overall-score">{evaluation.overall ?? '—'}</BigScore>
        <Text as="span" size="sm" tone="muted">
          / 100
        </Text>
        {evaluation.decision ? (
          <Badge tone={DECISION_TONE[evaluation.decision]} data-testid="decision-badge">
            {evaluation.decision}
          </Badge>
        ) : null}
        {evaluation.stopReason ? (
          <Badge tone="neutral" data-testid="stop-reason">
            {humanizeToken(evaluation.stopReason)}
          </Badge>
        ) : null}
      </ScoreRow>
      {evaluation.decisionReason ? (
        <Text size="sm" tone="muted" data-testid="decision-reason">
          {evaluation.decisionReason}
        </Text>
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
              <Meter key={key} label={humanizeToken(key)} value={value} data-dimension={key} />
            ),
          )}
        </Stack>
      ) : null}
    </Stack>
  );
}
