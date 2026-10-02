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

  it('[EVAL-2] reads the rationale with the labels of the places it names in place of the positional ids, and wraps what no label covers', () => {
    renderWithTheme(
      <CriterionResultsList
        results={[
          makeCriterionResult({
            criterionId: 'c2',
            result: 'not_applicable',
            rationale: 'edge.5 shows the read-only API; narration.4 describes a keyed read.',
            locations: [
              { ref: 'edge.5', label: 'e-5 · n-2 → n-3 (sync)', part: 'edge', key: 'e-5' },
              { ref: 'narration.4', label: 'c4 narration', part: 'narration', key: 'c4' },
            ],
          }),
        ]}
        criteria={makeCriteria()}
      />,
    );

    const row = screen.getByTestId('criterion-result-c2');
    const rationale = within(row).getByTestId('criterion-rationale');
    expect(rationale.textContent).toBe(
      'e-5 · n-2 → n-3 (sync) shows the read-only API; c4 narration describes a keyed read.',
    );
    expect(getComputedStyle(rationale).overflowWrap).toBe('anywhere');
    expect(within(row).getByText('not applicable')).toBeTruthy();
  });

  it('[EVAL-2] reads a ref the lens capitalised, a place the sentence already names and a finding type as words — never a position or a wire token', () => {
    renderWithTheme(
      <CriterionResultsList
        results={[
          makeCriterionResult({
            criterionId: 'c3',
            result: 'partial',
            rationale:
              'Rationale.1 asserts a replica; Orders DB (node.3) models none, per the data_integrity defect.',
            locations: [
              {
                ref: 'rationale.1',
                label: 'Orders DB rationale (n-3)',
                part: 'rationale',
                key: 'n-3',
              },
              {
                ref: 'node.3',
                label: 'n-3 · database · Orders DB',
                part: 'node',
                key: 'n-3',
                name: 'Orders DB',
              },
            ],
          }),
        ]}
        criteria={makeCriteria()}
      />,
    );

    expect(
      within(screen.getByTestId('criterion-result-c3')).getByTestId('criterion-rationale')
        .textContent,
    ).toBe(
      'Orders DB rationale (n-3) asserts a replica; Orders DB (n-3) models none, per the data integrity defect.',
    );
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
