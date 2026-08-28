'use client';

import styled from '@emotion/styled';
import { EVAL_DIMENSIONS, type EvaluationDto } from '@sysdesign/contracts';
import { Badge, Meter, Stack, Text } from '@sysdesign/design-system';

const ScoreRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[4]}px;
`;

const BigScore = styled.span`
  font-size: 40px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1;
  color: ${({ theme }) => theme.color.text.primary};
  font-variant-numeric: tabular-nums;
`;

export interface ScoreSummaryProps {
  evaluation: EvaluationDto;
}

/**
 * The headline: overall score, grade, and one meter per rubric dimension in
 * the contract's canonical order. Purely presentational — Storybook-safe.
 */
export function ScoreSummary({ evaluation }: ScoreSummaryProps) {
  const scores = evaluation.dimensionScores;

  return (
    <Stack gap={5} data-testid="score-summary">
      <ScoreRow>
        <BigScore data-testid="overall-score">{evaluation.overallScore ?? '—'}</BigScore>
        <Text as="span" size="sm" tone="muted">
          / 100
        </Text>
        {evaluation.grade ? <Badge tone="accent">{`grade ${evaluation.grade}`}</Badge> : null}
      </ScoreRow>
      {evaluation.summary ? <Text size="sm">{evaluation.summary}</Text> : null}
      {scores ? (
        <Stack gap={3}>
          {EVAL_DIMENSIONS.map((dimension) => (
            <Meter key={dimension} label={dimension} value={scores[dimension]} />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
