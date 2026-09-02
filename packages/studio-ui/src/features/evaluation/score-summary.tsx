'use client';

import styled from '@emotion/styled';
import {
  EVAL_DIMENSIONS,
  UNMODELLED_QUALITY_AREAS,
  type EvaluationDto,
} from '@sysdesign/contracts';
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
        {evaluation.capApplied ? (
          <Badge tone="critical" data-testid="grade-cap">
            {`capped at ${evaluation.capApplied.maxGrade} · ${evaluation.capApplied.count} critical`}
          </Badge>
        ) : null}
      </ScoreRow>
      {evaluation.summary ? <Text size="sm">{evaluation.summary}</Text> : null}
      {scores ? (
        <Stack gap={3}>
          {EVAL_DIMENSIONS.map((dimension) => {
            // `?? null`: an evaluation stored before a dimension existed has
            // no key for it at all — that is "not assessed", never a NaN
            // meter. Null = the rubric never examined this dimension — no
            // meter, no value, so a screen reader hears nothing measurable.
            const value = scores[dimension] ?? null;
            return value === null ? (
              <NotAssessedRow key={dimension} data-testid={`not-assessed-${dimension}`}>
                <Text as="span" size="sm" tone="muted">
                  {dimension}
                </Text>
                <Text as="span" size="sm" tone="muted">
                  Not assessed
                </Text>
              </NotAssessedRow>
            ) : (
              <Meter key={dimension} label={dimension} value={value} />
            );
          })}
        </Stack>
      ) : null}

      {/*
        The edge of the map. A score out of 100 invites the reading that 100
        means the design is good, rather than that nothing the engine knows how
        to check is missing — and the gap between those is where a reviewer's
        first questions live. Naming it costs one line and stops the number
        teaching the wrong lesson.
      */}
      <Text size="sm" tone="muted" data-testid="unassessed-areas">
        Outside this rubric:{' '}
        {UNMODELLED_QUALITY_AREAS.map((area) => area.label.toLowerCase()).join(', ')}.
      </Text>
    </Stack>
  );
}
