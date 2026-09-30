import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeCriteria, makeEvaluation } from '../../testing/fixtures';
import { EvaluationPanel, type EvaluationPanelProps } from './evaluation-panel';

const noop = () => undefined;

function renderPanel(overrides: Partial<EvaluationPanelProps> = {}) {
  return renderWithTheme(
    <EvaluationPanel
      evaluation={null}
      error={null}
      isPolling={false}
      message=""
      criteria={makeCriteria()}
      onRetry={noop}
      onSelectFinding={noop}
      {...overrides}
    />,
  );
}

describe('EvaluationPanel', () => {
  it('[DEL-4] a legacy revision shows the no-evaluation notice with a resubmit, and an escalation without a score explains itself', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { unmount } = renderPanel({ legacy: true, onRetry });

    const notice = screen.getByTestId('evaluation-legacy');
    expect(notice.textContent).toContain('has no evaluation');
    expect(screen.queryByText('Submit your design to have the quality loop grade it.')).toBeNull();
    await user.click(screen.getByTestId('retry-evaluation'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();

    renderPanel({
      evaluation: makeEvaluation({ decision: 'escalate', overall: null, dimensions: {} }),
    });
    expect(screen.getByTestId('evaluation-escalated').textContent).toContain('without a score');
    expect(screen.getByTestId('evaluation-escalated').textContent).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    expect(screen.getByTestId('overall-score').textContent).toBe('—');
  });

  it('[EVAL-1] a complete grade renders the headline, the criterion list and the findings', () => {
    renderPanel({ evaluation: makeEvaluation() });

    expect(screen.getByTestId('overall-score').textContent).toBe('72');
    expect(screen.getByTestId('decision-reason').textContent).toBe(
      'below the accept threshold of 75',
    );
    expect(screen.getByRole('list', { name: 'Criterion results' })).toBeTruthy();
    expect(screen.getByTestId('findings-list')).toBeTruthy();
    expect(screen.queryByTestId('evaluation-escalated')).toBeNull();
  });

  it('idles with the submit copy, spins while running, and offers a resubmit on a failed run', () => {
    const { unmount } = renderPanel();
    expect(screen.getByText('Submit your design to have the quality loop grade it.')).toBeTruthy();
    unmount();

    const running = renderPanel({
      evaluation: makeEvaluation({ status: 'running', overall: null, decision: null }),
      isPolling: true,
    });
    expect(screen.getByText('The lenses are reading your design…')).toBeTruthy();
    running.unmount();

    renderPanel({ error: 'the run failed' });
    expect(screen.getByTestId('evaluation-error').textContent).toContain('the run failed');
    expect(screen.getByTestId('retry-evaluation')).toBeTruthy();
  });
});
