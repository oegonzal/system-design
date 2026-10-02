import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeCriteria, makeEvaluation, makeHeartbeat } from '../../testing/fixtures';
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
  it('[UX-17] a revision with no grade to show says why — never graded, or its grade lost — and offers to grade it in place', async () => {
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
  });

  it('[UX-18] a grade the lenses could not settle says it couldn’t be graded and why, offers to grade it again — never a 0/100, an escalation or "the score stands"', async () => {
    const user = userEvent.setup();
    const onRegrade = vi.fn();
    renderPanel({
      onRegrade,
      evaluation: makeEvaluation({
        overall: null,
        unscored: 'unassessed',
        decision: 'escalate',
        decisionReason: 'only 0% of criteria assessed; unassessed: c1, c2, c3, c4, c5',
        decisionBasis: {
          factor: 'evidence',
          facts: {},
          remediations: 0,
          criteria: { assessed: 0, total: 5 },
        },
        dimensions: { coverage: null, quality_attributes: null, compliance: null },
        degraded: [
          { stage: 'critic.explanation', sample: 2, reason: 'llm-failed' },
          { stage: 'evaluator.requirements', sample: 1, reason: 'llm-failed' },
        ],
        criterionResults: [
          {
            criterionId: 'c1',
            result: 'unassessed',
            confidence: null,
            rationale: null,
            locations: [],
            mentions: [],
          },
        ],
      }),
    });

    const notice = screen.getByTestId('evaluation-unscored');
    expect(notice.getAttribute('data-reason')).toBe('unassessed');
    expect(notice.textContent).toContain('This revision couldn’t be graded');
    expect(notice.textContent).toContain('The lenses assessed 0 of 5 criteria — too few to score');
    expect(notice.textContent).toContain(
      '2 lens samples did not answer: critic explanation #2 (the model did not answer), evaluator requirements #1 (the model did not answer).',
    );
    // No headline: no number, no decision, no meters, and nothing standing on the lenses that answered.
    expect(screen.queryByTestId('score-summary')).toBeNull();
    expect(screen.queryByTestId('overall-score')).toBeNull();
    expect(screen.queryByTestId('decision-badge')).toBeNull();
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
    expect(screen.getByTestId('evaluation-panel').textContent).not.toContain('score stands');
    expect(screen.getByTestId('evaluation-panel').textContent).not.toContain('escalate');
    // A criterion nobody settled is shown as that, with no lens's words beside it.
    const row = screen.getByTestId('criterion-result-c1');
    expect(row.getAttribute('data-result')).toBe('unassessed');
    expect(within(row).queryByTestId('criterion-rationale')).toBeNull();

    const regrade = within(notice).getByTestId('retry-evaluation');
    expect(regrade.textContent).toBe('Grade this revision again');
    await user.click(regrade);
    expect(onRegrade).toHaveBeenCalledTimes(1);
  });

  it('[UX-18] a grade with nothing to judge says so, with no score and nothing to grade again', () => {
    renderPanel({
      evaluation: makeEvaluation({
        overall: null,
        unscored: 'no-artifact',
        decision: 'escalate',
        decisionReason: 'no artifact to judge',
        decisionBasis: {
          factor: 'artifact',
          facts: {},
          remediations: 0,
          criteria: { assessed: 0, total: 5 },
        },
        dimensions: {},
      }),
    });
    const notice = screen.getByTestId('evaluation-unscored');
    expect(notice.getAttribute('data-reason')).toBe('no-artifact');
    expect(notice.textContent).toContain('There was nothing to grade');
    expect(screen.queryByTestId('retry-evaluation')).toBeNull();
    expect(screen.queryByTestId('overall-score')).toBeNull();
  });

  it('[UX-15] says whose feedback it shows, marks a revision the coach wrote, and says when the canvas has moved on to the draft', () => {
    const onCanvas = renderPanel({
      subject: { revisionNumber: 2, origin: 'assistant', onCanvas: true },
      evaluation: makeEvaluation(),
    });
    const subject = screen.getByTestId('feedback-subject');
    expect(subject.textContent).toContain('Feedback for revision #2');
    expect(subject.textContent).toContain('AI');
    expect(screen.queryByTestId('feedback-off-canvas')).toBeNull();
    onCanvas.unmount();

    const drafted = renderPanel({
      subject: { revisionNumber: 1, origin: 'user', onCanvas: false },
      evaluation: makeEvaluation(),
    });
    expect(screen.getByTestId('feedback-subject').textContent).not.toContain('AI');
    expect(screen.getByTestId('feedback-off-canvas').textContent).toBe(
      'The canvas shows your draft, not this revision.',
    );
    drafted.unmount();

    renderPanel();
    expect(screen.queryByTestId('feedback-subject')).toBeNull();
  });

  it('[EVAL-1] a complete grade renders the headline, the criterion list and the findings', () => {
    renderPanel({ evaluation: makeEvaluation() });

    expect(screen.getByTestId('overall-score').textContent).toBe('72');
    expect(screen.getByTestId('decision-reason').textContent).toBe(
      'Below the accept threshold — 1 fix to make.',
    );
    expect(screen.getByRole('list', { name: 'Criterion results' })).toBeTruthy();
    expect(screen.getByTestId('findings-list')).toBeTruthy();
    expect(screen.queryByTestId('evaluation-unscored')).toBeNull();
  });

  it('idles with the submit copy, spins while running with how long it takes, and offers to grade a failed revision again', () => {
    const { unmount } = renderPanel();
    expect(screen.getByText('Submit your design to have the quality loop grade it.')).toBeTruthy();
    unmount();

    // The clock counts from the run's own start, not from when the page
    // thought the grade began — a reload, a re-grade — once the poll has it.
    const running = renderPanel({
      evaluation: makeEvaluation({
        status: 'running',
        overall: null,
        decision: null,
        startedAt: new Date(Date.now() - 75_000).toISOString(),
        heartbeatAt: new Date(Date.now() - 5_000).toISOString(),
        readAt: new Date().toISOString(),
      }),
      isPolling: true,
      startedAt: new Date(Date.now() - 600_000).toISOString(),
      heartbeat: makeHeartbeat(),
    });
    expect(screen.getByText('The lenses are reading your design…')).toBeTruthy();
    expect(screen.getByTestId('grading-duration').textContent).toMatch(
      /^Grading usually takes a few minutes — 1:1\d so far\.$/,
    );
    expect(screen.queryByTestId('grading-silence')).toBeNull();
    running.unmount();

    // Before the poll has read the run, the page's own word on the start stands in.
    const unread = renderPanel({
      evaluation: null,
      isPolling: true,
      startedAt: new Date(Date.now() - 75_000).toISOString(),
    });
    expect(screen.getByTestId('grading-duration').textContent).toMatch(/ — 1:1\d so far\.$/);
    unread.unmount();

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
    const detail = within(alert).getByTestId('failure-detail');
    expect(within(detail).getByRole('button').getAttribute('aria-expanded')).toBe('false');
    expect(detail.textContent).toContain('the run failed');
    expect(screen.getByTestId('retry-evaluation').textContent).toBe('Grade this revision again');
    expect(screen.queryByTestId('grading-duration')).toBeNull();
  });

  it('[EVAL-1] says the grader has not reported, and for how long, once a running grade’s heartbeat has gone stale — never a silent spinner', () => {
    // On the server's clock, an hour behind the page's: the grade is read
    // against the server's own instant, never the page's.
    const server = Date.now() - 3_600_000;
    const quiet = makeEvaluation({
      status: 'running',
      overall: null,
      decision: null,
      startedAt: new Date(server - 400_000).toISOString(),
      heartbeatAt: new Date(server - 190_000).toISOString(),
      readAt: new Date(server).toISOString(),
    });
    // Until the page knows the loop's pace, it claims no silence.
    const paceless = renderPanel({ evaluation: quiet, isPolling: true });
    expect(screen.queryByTestId('grading-silence')).toBeNull();
    paceless.unmount();

    renderPanel({ evaluation: quiet, isPolling: true, heartbeat: makeHeartbeat() });

    const silence = screen.getByTestId('grading-silence');
    expect(silence.getAttribute('role')).toBe('alert');
    expect(silence.textContent).toContain('The grader has not reported for 3 minutes.');
    expect(silence.textContent).toContain('gives the run up');
    expect(silence.getAttribute('data-minutes')).toBe('3');
    expect(screen.getByTestId('grading-duration').textContent).toMatch(/ — 6:[34]\d so far\.$/);
    // Still running: the spinner and its line stay, and nothing calls the grade failed.
    expect(screen.getByText('The lenses are reading your design…')).toBeTruthy();
    expect(screen.queryByTestId('evaluation-error')).toBeNull();
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
