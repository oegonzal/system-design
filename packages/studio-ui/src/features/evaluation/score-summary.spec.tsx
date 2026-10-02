import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeCriteria, makeEvaluation, makeFinding } from '../../testing/fixtures';
import { formatScore } from './score';
import { ScoreSummary } from './score-summary';
import { STOPPED_COPY } from './stop-reason';

describe('ScoreSummary', () => {
  it('[EVAL-1] shows the overall score and the decision', () => {
    renderWithTheme(<ScoreSummary evaluation={makeEvaluation()} />);

    expect(screen.getByTestId('overall-score').textContent).toBe('72');
    expect(screen.getByTestId('decision-badge').textContent).toBe('revise');
  });

  it('[DEL-4] says nothing about a stop on a plain grade, and says a coach’s stop in the coach’s own sentence — never the loop’s token', () => {
    const { unmount } = renderWithTheme(<ScoreSummary evaluation={makeEvaluation()} />);
    expect(screen.queryByTestId('stop-reason')).toBeNull();
    unmount();

    for (const stopReason of ['plateau', 'max-iterations'] as const) {
      const coached = renderWithTheme(
        <ScoreSummary evaluation={makeEvaluation({ iteration: 3, stopReason })} />,
      );
      const stop = screen.getByTestId('stop-reason').textContent ?? '';
      expect(stop).toBe(STOPPED_COPY[stopReason]);
      expect(stop).not.toMatch(/max.iterations/i);
      coached.unmount();
    }
  });

  it('[EVAL-1] [DEL-8] shows the decision’s reason under the headline, in the reader’s words — never the controller’s "remediation(s)"', () => {
    const { unmount } = renderWithTheme(<ScoreSummary evaluation={makeEvaluation()} />);
    expect(screen.getByTestId('decision-reason').textContent).toBe(
      'Below the accept threshold — 1 fix to make.',
    );
    unmount();

    const routed = renderWithTheme(
      <ScoreSummary
        evaluation={makeEvaluation({
          decisionReason: '10 remediation(s) to apply',
          decisionBasis: {
            factor: 'route',
            facts: {},
            remediations: 10,
            criteria: { assessed: 9, total: 10 },
          },
        })}
      />,
    );
    expect(screen.getByTestId('decision-reason').textContent).toBe(
      'Below the accept threshold — 10 fixes to make.',
    );
    routed.unmount();

    renderWithTheme(
      <ScoreSummary evaluation={makeEvaluation({ decisionReason: null, decisionBasis: null })} />,
    );
    expect(screen.queryByTestId('decision-reason')).toBeNull();
  });

  it('[EVAL-1] names each blocker the decision cites — a finding by its type and places, a criterion by its statement — and wraps inside the dock', () => {
    const finding = makeFinding({
      id: 'contradiction|binding.2,edge.5',
      type: 'contradiction',
      locations: [
        { ref: 'binding.2', label: 'c2 binding (n-3)', part: 'binding', key: 'c2' },
        { ref: 'edge.5', label: 'e-5 · n-2 → n-3 (sync)', part: 'edge', key: 'e-5' },
      ],
      locationRefs: ['binding.2', 'edge.5'],
    });
    renderWithTheme(
      <ScoreSummary
        evaluation={makeEvaluation({
          decision: 'revise',
          decisionReason: 'blockers to fix: contradiction|binding.2,edge.5, c3',
          decisionBasis: {
            factor: 'policy-allowed',
            facts: {},
            remediations: 2,
            criteria: { assessed: 5, total: 5 },
          },
          findings: [finding],
        })}
        criteria={makeCriteria()}
      />,
    );

    const reason = screen.getByTestId('decision-reason');
    expect(reason.textContent).toBe(
      'blockers to fix: Contradiction (c2 binding (n-3); e-5 · n-2 → n-3 (sync)), “p99 read latency stays under 200 ms”',
    );
    expect(getComputedStyle(reason).overflowWrap).toBe('anywhere');
  });

  it('[EVAL-1] prints the overall and every dimension meter through the one score format', () => {
    renderWithTheme(
      <ScoreSummary
        evaluation={makeEvaluation({ overall: 12.1, dimensions: { coverage: 16.6 } })}
      />,
    );

    expect(screen.getByTestId('overall-score').textContent).toBe(formatScore(12.1));
    const meter = screen.getByRole('meter');
    // The meter prints what formatScore says, on screen and to a screen reader.
    expect(meter.getAttribute('aria-valuetext')).toBe(formatScore(16.6));
    expect(screen.getByText(formatScore(16.6))).toBeTruthy();
    expect(meter.getAttribute('aria-valuenow')).toBe('17');
  });

  it('[DEL-4] says which lens samples the grade was computed without, and nothing when every lens answered', () => {
    const { unmount } = renderWithTheme(
      <ScoreSummary
        evaluation={makeEvaluation({
          degraded: [
            { stage: 'critic.scale', sample: 1, reason: 'llm-failed' },
            { stage: 'evaluator.quality', sample: null, reason: 'token-clipped' },
          ],
        })}
      />,
    );
    const note = screen.getByTestId('degraded-note').textContent ?? '';
    expect(note).toContain('Graded with 2 lens samples missing');
    expect(note).toContain('critic scale #1 (the model did not answer)');
    expect(note).toContain('evaluator quality (its answer was cut off)');
    expect(note).not.toContain('llm-failed');
    unmount();

    renderWithTheme(<ScoreSummary evaluation={makeEvaluation()} />);
    expect(screen.queryByTestId('degraded-note')).toBeNull();
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
          dimensions: {},
        })}
      />,
    );

    expect(screen.getByTestId('overall-score').textContent).toBe('—');
    expect(screen.getByTestId('decision-badge').textContent).toBe('escalate');
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
  });
});
