import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
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
      onRegrade={noop}
      onSelectFinding={noop}
      {...overrides}
    />,
  );
}

describe('EvaluationPanel', () => {
  it('[UX-17] a revision with no grade to show says why — never graded, or its grade lost — and offers to grade it in place; an escalation without a score explains itself', async () => {
    const user = userEvent.setup();
    const onRegrade = vi.fn();
    const never = renderPanel({ ungraded: 'never', onRegrade });

    const notice = screen.getByTestId('evaluation-ungraded');
    expect(notice.getAttribute('data-reason')).toBe('never');
    expect(notice.textContent).toContain('was never graded');
    expect(notice.textContent).toContain('the revision stays as it is');
    expect(screen.queryByText('Submit your design to have the quality loop grade it.')).toBeNull();
    expect(screen.getByTestId('retry-evaluation').textContent).toBe('Grade this revision');
    await user.click(screen.getByTestId('retry-evaluation'));
    expect(onRegrade).toHaveBeenCalledTimes(1);
    never.unmount();

    // A grade the grader lost is not a run still going: no spinner, the same way back.
    const lost = renderPanel({ ungraded: 'lost', isPolling: false, onRegrade });
    expect(screen.getByTestId('evaluation-ungraded').textContent).toContain(
      'no longer has this revision’s grade',
    );
    expect(screen.queryByTestId('grading-duration')).toBeNull();
    expect(screen.queryByTestId('evaluation-error')).toBeNull();
    lost.unmount();

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

  it('idles with the submit copy, spins while running with how long it takes, and offers to grade a failed revision again', () => {
    const { unmount } = renderPanel();
    expect(screen.getByText('Submit your design to have the quality loop grade it.')).toBeTruthy();
    unmount();

    const running = renderPanel({
      evaluation: makeEvaluation({ status: 'running', overall: null, decision: null }),
      isPolling: true,
      startedAt: new Date(Date.now() - 75_000).toISOString(),
    });
    expect(screen.getByText('The lenses are reading your design…')).toBeTruthy();
    expect(screen.getByTestId('grading-duration').textContent).toMatch(
      /^Grading usually takes a few minutes — 1:1\d so far\.$/,
    );
    running.unmount();

    const unstamped = renderPanel({ evaluation: null, isPolling: true });
    expect(screen.getByTestId('grading-duration').textContent).toBe(
      'Grading usually takes a few minutes.',
    );
    unstamped.unmount();

    renderPanel({ error: 'the run failed' });
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('data-testid')).toBe('evaluation-error');
    // The author's sentence leads; the run's own error is kept, folded under it.
    expect(alert.textContent).toContain('Grading stopped unexpectedly');
    expect(alert.textContent).toContain('This revision was not graded.');
    const detail = within(alert).getByTestId('failure-detail') as HTMLDetailsElement;
    expect(detail.open).toBe(false);
    expect(detail.textContent).toContain('the run failed');
    expect(screen.getByTestId('retry-evaluation').textContent).toBe('Grade this revision again');
    expect(screen.queryByTestId('grading-duration')).toBeNull();
  });

  it('[UX-17] the grade-again control is off while its request is on the way, and off with the session’s reason while a run holds the slot', () => {
    const sending = renderPanel({ error: 'the run failed', regrading: true });
    const busy = screen.getByTestId('retry-evaluation') as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.textContent).toBe('Sending it to the grader…');
    sending.unmount();

    const reason = 'The coach is still revising from revision #1 — wait for it to finish.';
    renderPanel({ error: 'the run failed', regradeBlockedReason: reason });
    const blocked = screen.getByTestId('retry-evaluation') as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    expect(blocked.title).toBe(reason);
  });
});
