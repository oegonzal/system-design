import { EVAL_DIMENSIONS } from '@sysdesign/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeEvaluation } from '../../testing/fixtures';
import { renderWithTheme } from '../../testing/render';
import { ScoreSummary } from './score-summary';

describe('ScoreSummary', () => {
  it('shows the overall score, grade badge and summary', () => {
    renderWithTheme(<ScoreSummary evaluation={makeEvaluation()} />);

    expect(screen.getByTestId('overall-score').textContent).toBe('72');
    expect(screen.getByText('grade B')).toBeTruthy();
    expect(screen.getByText(/reliability is the weak dimension/i)).toBeTruthy();
  });

  it('renders one meter per rubric dimension, in contract order', () => {
    renderWithTheme(<ScoreSummary evaluation={makeEvaluation()} />);

    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(EVAL_DIMENSIONS.length);

    const evaluation = makeEvaluation();
    EVAL_DIMENSIONS.forEach((dimension, index) => {
      expect(meters[index].getAttribute('aria-valuenow')).toBe(
        String(evaluation.dimensionScores?.[dimension]),
      );
    });
    // Order follows the contract tuple, not insertion order.
    expect(
      screen.getByText('reliability').compareDocumentPosition(screen.getByText('hygiene')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders a null dimension as "Not assessed" with no meter', () => {
    const evaluation = makeEvaluation();
    renderWithTheme(
      <ScoreSummary
        evaluation={makeEvaluation({
          dimensionScores: { ...evaluation.dimensionScores!, security: null },
        })}
      />,
    );

    expect(screen.getAllByRole('meter')).toHaveLength(EVAL_DIMENSIONS.length - 1);
    const row = screen.getByTestId('not-assessed-security');
    expect(row.textContent).toContain('security');
    expect(row.textContent).toContain('Not assessed');
    // No measurement is exposed for the unassessed dimension.
    expect(row.querySelector('[aria-valuenow]')).toBeNull();
  });

  it('renders a placeholder when scores are not present yet', () => {
    renderWithTheme(
      <ScoreSummary
        evaluation={makeEvaluation({
          overallScore: null,
          grade: null,
          dimensionScores: null,
          summary: null,
        })}
      />,
    );

    expect(screen.getByTestId('overall-score').textContent).toBe('—');
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
  });
});
