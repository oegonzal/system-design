'use client';

import styled from '@emotion/styled';
import {
  proseLocations,
  type CriterionResultDto,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import { Badge, RESULT_TONE, Stack, Text } from '@sysdesign/design-system';

import { humanizeToken } from './humanize';
import { lensProse } from './lens-prose';
import { WrappingText } from './wrapping-text';

export interface CriterionResultsListProps {
  results: CriterionResultDto[];
  /** The prompt's rubric, so a row reads as a statement rather than `c3`. */
  criteria: SuccessCriterion[];
}

const Row = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme }) => theme.space[3]}px 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
  list-style: none;

  &:last-of-type {
    border-bottom: none;
  }
`;

const Line = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[2]}px;
`;

/**
 * Whether a lens settled the criterion. One no lens settled is shown as that
 * and nothing more — no confidence, no lens's words beside it, which would
 * read as a verdict that was then thrown away.
 */
const settled = (row: CriterionResultDto): boolean => row.result !== 'unassessed';

/**
 * One stacked row per criterion the evaluators judged: the statement, the
 * settled result with the confidence behind it, and the evaluator's reason
 * on its own line, read with the labels of the places it names — cited as
 * evidence or merely mentioned (`proseLocations`) — in place of the
 * positional ids the model wrote. Stacked rather than tabular so a long
 * statement and a long reason both wrap inside the dock instead of
 * squeezing four columns into it. Purely presentational — Storybook-safe.
 */
export function CriterionResultsList({ results, criteria }: CriterionResultsListProps) {
  if (results.length === 0) {
    return (
      <Text size="sm" tone="muted" data-testid="criterion-results-empty">
        No criteria were assessed.
      </Text>
    );
  }

  const statementOf = new Map(criteria.map((criterion) => [criterion.id, criterion.statement]));

  return (
    <Stack as="ul" gap={0} aria-label="Criterion results" data-testid="criterion-results">
      {results.map((row) => (
        <Row
          key={row.criterionId}
          data-testid={`criterion-result-${row.criterionId}`}
          data-result={row.result}
        >
          <Line>
            <Badge tone="accent">{row.criterionId}</Badge>
            <Text as="span" size="sm">
              {statementOf.get(row.criterionId) ?? ''}
            </Text>
          </Line>
          <Line>
            <Badge tone={RESULT_TONE[row.result]}>{humanizeToken(row.result).toLowerCase()}</Badge>
            {settled(row) ? (
              <Text as="span" size="sm" tone="muted">
                {row.confidence ? `${row.confidence} confidence` : '—'}
              </Text>
            ) : null}
          </Line>
          {settled(row) ? (
            <WrappingText size="sm" tone="secondary" data-testid="criterion-rationale">
              {row.rationale !== null ? lensProse(row.rationale, proseLocations(row)) : '—'}
            </WrappingText>
          ) : null}
        </Row>
      ))}
    </Stack>
  );
}
