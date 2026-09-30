import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeEvaluation } from '../../testing/fixtures';
import { ScoreSummary } from './score-summary';

describe('ScoreSummary', () => {
  it('[EVAL-1] shows the overall score, the decision and why the loop stopped', () => {
    renderWithTheme(<ScoreSummary evaluation={makeEvaluation()} />);

    expect(screen.getByTestId('overall-score').textContent).toBe('72');
    expect(screen.getByTestId('decision-badge').textContent).toBe('revise');
    expect(screen.getByTestId('stop-reason').textContent).toBe('Max iterations');
  });

  it('[EVAL-1] renders one meter per dimension the pipeline reported, keyed by its own name', () => {
    renderWithTheme(<ScoreSummary evaluation={makeEvaluation()} />);

    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(3);
    expect(meters.map((meter) => meter.getAttribute('aria-valuenow'))).toEqual(['80', '60', '90']);
    // The key is stamped verbatim; the label reads as words.
    expect(document.querySelector('[data-dimension="quality_attributes"]')).toBeTruthy();
    expect(screen.getByText('Quality attributes')).toBeTruthy();
  });

  it('renders whatever dimensions arrive — a pipeline with other names needs no edit here', () => {
    renderWithTheme(
      <ScoreSummary
        evaluation={makeEvaluation({ dimensions: { fidelity: 40, gradeability: 55, scope: 100 } })}
      />,
    );
    expect(screen.getAllByRole('meter')).toHaveLength(3);
    expect(document.querySelector('[data-dimension="fidelity"]')).toBeTruthy();
  });

  it('renders a null dimension as "Not assessed" with no meter', () => {
    renderWithTheme(
      <ScoreSummary
        evaluation={makeEvaluation({
          dimensions: { coverage: 80, quality_attributes: null, compliance: 90 },
        })}
      />,
    );

    expect(screen.getAllByRole('meter')).toHaveLength(2);
    const row = screen.getByTestId('not-assessed-quality_attributes');
    expect(row.textContent).toContain('Quality attributes');
    expect(row.textContent).toContain('Not assessed');
    expect(row.querySelector('[aria-valuenow]')).toBeNull();
  });

  it('renders a placeholder when the loop escalated without a score', () => {
    renderWithTheme(
      <ScoreSummary
        evaluation={makeEvaluation({
          overall: null,
          decision: 'escalate',
          stopReason: 'escalated',
          dimensions: {},
        })}
      />,
    );

    expect(screen.getByTestId('overall-score').textContent).toBe('—');
    expect(screen.getByTestId('decision-badge').textContent).toBe('escalate');
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
  });
});
