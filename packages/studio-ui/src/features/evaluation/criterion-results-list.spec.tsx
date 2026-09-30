import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeCriteria, makeCriterionResult } from '../../testing/fixtures';
import { CriterionResultsList } from './criterion-results-list';

describe('CriterionResultsList', () => {
  it('[EVAL-1] renders one stacked row per criterion with its statement, result, confidence and reason', () => {
    renderWithTheme(
      <CriterionResultsList
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

    expect(screen.getByRole('list', { name: 'Criterion results' })).toBeTruthy();
    const pass = screen.getByTestId('criterion-result-c1');
    expect(pass.getAttribute('data-result')).toBe('pass');
    expect(pass.textContent).toContain('A shopper reads their merged order history');
    expect(pass.textContent).toContain('high confidence');
    expect(pass.textContent).toContain('The binding traces the read');
    expect(within(pass).getByText('pass')).toBeTruthy();

    expect(screen.getByTestId('criterion-result-c3').getAttribute('data-result')).toBe('fail');
    const unassessed = screen.getByTestId('criterion-result-c4');
    expect(unassessed.textContent).toContain('—');
    expect(unassessed.textContent).not.toContain('confidence');
  });

  it('falls back to the bare id for a criterion the rubric no longer lists', () => {
    renderWithTheme(
      <CriterionResultsList results={[makeCriterionResult({ criterionId: 'c9' })]} criteria={[]} />,
    );
    expect(screen.getByTestId('criterion-result-c9').textContent).toContain('c9');
  });

  it('says so when nothing was assessed', () => {
    renderWithTheme(<CriterionResultsList results={[]} criteria={makeCriteria()} />);
    expect(screen.getByTestId('criterion-results-empty')).toBeTruthy();
  });
});
