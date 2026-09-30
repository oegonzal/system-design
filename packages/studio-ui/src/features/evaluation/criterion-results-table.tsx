'use client';

import type { CriterionResultDto, SuccessCriterion } from '@sysdesign/contracts';
import { Badge, RESULT_TONE, Table, Text } from '@sysdesign/design-system';

export interface CriterionResultsTableProps {
  results: CriterionResultDto[];
  /** The prompt's rubric, so a row reads as a statement rather than `c3`. */
  criteria: SuccessCriterion[];
}

/**
 * One row per criterion the evaluators judged: the statement, the settled
 * result, the confidence behind it and the evaluator's reason. Purely
 * presentational — Storybook-safe.
 */
export function CriterionResultsTable({ results, criteria }: CriterionResultsTableProps) {
  if (results.length === 0) {
    return (
      <Text size="sm" tone="muted" data-testid="criterion-results-empty">
        No criteria were assessed.
      </Text>
    );
  }

  const statementOf = new Map(criteria.map((criterion) => [criterion.id, criterion.statement]));

  return (
    <Table aria-label="Criterion results" data-testid="criterion-results">
      <thead>
        <tr>
          <th scope="col">Criterion</th>
          <th scope="col">Result</th>
          <th scope="col">Confidence</th>
          <th scope="col">Why</th>
        </tr>
      </thead>
      <tbody>
        {results.map((row) => (
          <tr
            key={row.criterionId}
            data-testid={`criterion-result-${row.criterionId}`}
            data-result={row.result}
          >
            <td>
              <Badge tone="accent">{row.criterionId}</Badge>{' '}
              {statementOf.get(row.criterionId) ?? ''}
            </td>
            <td>
              <Badge tone={RESULT_TONE[row.result]}>{row.result.replace('_', ' ')}</Badge>
            </td>
            <td>{row.confidence ?? '—'}</td>
            <td>{row.rationale ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
