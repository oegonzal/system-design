import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeCriteria, makeCriterionResult } from '../../testing/fixtures';
import { CriterionResultsTable } from './criterion-results-table';

describe('CriterionResultsTable', () => {
  it('[EVAL-1] renders one row per criterion with its statement, result, confidence and reason', () => {
    renderWithTheme(
      <CriterionResultsTable
        results={[
          makeCriterionResult(),
          makeCriterionResult({ criterionId: 'c3', result: 'fail', confidence: 'medium' }),
          makeCriterionResult({
            criterionId: 'c4',
            result: 'unassessed',
            confidence: null,
            rationale: null,
          }),
        ]}
        criteria={makeCriteria()}
      />,
    );

    expect(screen.getByRole('table', { name: 'Criterion results' })).toBeTruthy();
    const pass = screen.getByTestId('criterion-result-c1');
    expect(pass.getAttribute('data-result')).toBe('pass');
    expect(pass.textContent).toContain('A shopper reads their merged order history');
    expect(pass.textContent).toContain('high');
    expect(within(pass).getByText('pass')).toBeTruthy();

    expect(screen.getByTestId('criterion-result-c3').getAttribute('data-result')).toBe('fail');
    const unassessed = screen.getByTestId('criterion-result-c4');
    expect(unassessed.textContent).toContain('—');
  });

  it('falls back to the bare id for a criterion the rubric no longer lists', () => {
    renderWithTheme(
      <CriterionResultsTable
        results={[makeCriterionResult({ criterionId: 'c9' })]}
        criteria={[]}
      />,
    );
    expect(screen.getByTestId('criterion-result-c9').textContent).toContain('c9');
  });

  it('says so when nothing was assessed', () => {
    renderWithTheme(<CriterionResultsTable results={[]} criteria={makeCriteria()} />);
    expect(screen.getByTestId('criterion-results-empty')).toBeTruthy();
  });
});
