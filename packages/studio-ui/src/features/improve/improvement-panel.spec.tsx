import {
  DEFAULT_IMPROVE_ITERATIONS,
  describeInFlight,
  MAX_IMPROVE_ITERATIONS,
  PROMPT_COPY,
} from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  makeCriteria,
  makeImproveIteration,
  makeImproveRun,
  makeRevisionSummary,
} from '../../testing/fixtures';
import { ImprovementPanel, type ImprovementPanelProps } from './improvement-panel';

const noop = () => undefined;
const LIVE = { status: 'reachable', model: 'claude' } as const;

function renderPanel(overrides: Partial<ImprovementPanelProps> = {}) {
  return renderWithTheme(
    <ImprovementPanel
      run={null}
      error={null}
      isPolling={false}
      message=""
      availability={LIVE}
      onStart={noop}
      onLoadRevision={noop}
      {...overrides}
    />,
  );
}

describe('ImprovementPanel', () => {
  it('[UX-11] offers 1..MAX iterations, defaulting to the contract default, and starts with the chosen count', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderPanel({ onStart });

    const select = screen.getByTestId('improve-iterations') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(
      Array.from({ length: MAX_IMPROVE_ITERATIONS }, (_, index) => String(index + 1)),
    );
    expect(select.value).toBe(String(DEFAULT_IMPROVE_ITERATIONS));

    await user.selectOptions(select, '2');
    await user.click(screen.getByTestId('improve-run'));
    expect(onStart).toHaveBeenCalledWith(2);
  });

  it('[UX-11] says so when the quality loop cannot be reached, and waits silently while availability is checked', () => {
    const { unmount } = renderPanel({ availability: { status: 'unreachable' } });
    expect((screen.getByTestId('improve-run') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('improver-unavailable').textContent).toContain('cannot reach');
    unmount();

    renderPanel({ availability: { status: 'checking' } });
    expect((screen.getByTestId('improve-run') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('improver-unavailable')).toBeNull();
  });

  it('[UX-14] is off with the reason while the session’s prompt is archived, whatever the grader says', () => {
    renderPanel({ promptArchived: true });
    expect((screen.getByTestId('improve-run') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('improver-unavailable').textContent).toBe(PROMPT_COPY.archived);
  });

  it('[DEL-3] is off with the session’s own reason while another run holds its grading slot', () => {
    const reason = describeInFlight({
      kind: 'grade',
      runId: 'run-7',
      revisionNumber: 2,
      state: 'running',
    });
    renderPanel({ blockedReason: reason });

    const start = screen.getByTestId('improve-run') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(start.title).toBe(reason);
    expect(screen.getByTestId('improver-unavailable').textContent).toBe(reason);
  });

  it('[UX-11] the iteration count reads the run’s own budget while there is a run, and the author’s choice for the next', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const { rerender } = renderPanel({
      run: makeImproveRun({ maxIterations: 2 }),
      isPolling: true,
      onStart,
    });
    const select = () => screen.getByTestId('improve-iterations') as HTMLSelectElement;
    expect(select().value).toBe('2');
    expect(select().disabled).toBe(true);

    rerender(
      <ImprovementPanel
        run={makeImproveRun({ maxIterations: 2, status: 'complete', stopReason: 'plateau' })}
        error={null}
        isPolling={false}
        message=""
        availability={LIVE}
        onStart={onStart}
        onLoadRevision={noop}
      />,
    );
    expect(select().value).toBe('2');
    await user.selectOptions(select(), '4');
    await user.click(screen.getByTestId('improve-run'));
    expect(onStart).toHaveBeenCalledWith(4);
  });

  it('[UX-11] renders the live run: model calls so far and one badge per outcome — starting point, imported, not better, refused with its problems', () => {
    renderPanel({
      run: makeImproveRun({
        exchangeCount: 7,
        iterations: [
          makeImproveIteration({
            iteration: 1,
            mode: 'provided',
            overall: 64,
            decision: 'revise',
            revisionId: 'rev-1',
          }),
          makeImproveIteration({
            iteration: 2,
            mode: 'revise',
            overall: 72,
            decision: 'revise',
            revisionId: 'rev-2',
          }),
          makeImproveIteration({
            iteration: 3,
            mode: 'revise',
            overall: 70,
            decision: 'revise',
            reason: 'no better than iteration 2',
            revisionId: null,
          }),
          makeImproveIteration({
            iteration: 4,
            mode: 'revise',
            overall: 81,
            decision: 'accept',
            outcome: 'refused',
            problems: ['binding c1 names a component the canvas does not draw'],
            revisionId: null,
          }),
        ],
      }),
      isPolling: true,
      message: 'Coaching — 7 model calls so far.',
    });

    expect(screen.getByTestId('improve-progress').textContent).toBe(
      'Coaching — iteration 3 of 3, 7 model calls so far…',
    );
    expect(screen.getByTestId('improve-iteration-1').textContent).toContain('starting point');
    expect(screen.getByTestId('improve-iteration-2').textContent).toContain('imported');
    const lower = screen.getByTestId('improve-iteration-3');
    expect(lower.textContent).toContain('not better');
    expect(within(lower).getByTestId('improve-iteration-reason').textContent).toBe(
      'no better than iteration 2',
    );
    const refused = screen.getByTestId('improve-iteration-4');
    expect(refused.textContent).toContain('refused');
    expect(within(refused).getByTestId('improve-iteration-problems').textContent).toContain(
      'binding c1 names a component the canvas does not draw',
    );
    expect(screen.queryByTestId('improve-iteration-adopted')).toBeNull();
    expect((screen.getByTestId('improve-run') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('load-best-revision')).toBeNull();
  });

  it('[UX-11] a run started from a graded revision shows its starting point as a reused grade', () => {
    renderPanel({
      run: makeImproveRun({
        iterations: [
          makeImproveIteration({ iteration: 1, mode: 'adopted', overall: 72, decision: 'revise' }),
        ],
      }),
      isPolling: true,
    });

    const base = screen.getByTestId('improve-iteration-1');
    expect(base.textContent).toContain('starting point');
    expect(within(base).getByTestId('improve-iteration-adopted').textContent).toBe('grade reused');
  });

  it('[UX-11] once stopped, explains why and offers the best imported revision', async () => {
    const onLoadRevision = vi.fn();
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        stopReason: 'plateau',
        iterations: [
          makeImproveIteration({
            iteration: 1,
            mode: 'provided',
            overall: 64,
            decision: 'revise',
            revisionId: 'rev-1',
          }),
          makeImproveIteration({
            iteration: 2,
            mode: 'revise',
            overall: 72,
            decision: 'revise',
            revisionId: 'rev-2',
          }),
          makeImproveIteration({
            iteration: 3,
            mode: 'revise',
            overall: 80,
            decision: 'accept',
            revisionId: 'rev-3',
          }),
        ],
      }),
      onLoadRevision,
    });

    expect(screen.getByTestId('improvement-stopped').textContent).toContain('plateaued');
    await userEvent.click(screen.getByTestId('load-best-revision'));
    expect(onLoadRevision).toHaveBeenCalledWith('rev-3');
  });

  it('[UX-11] names the criteria a reason cites by their statements, and wraps what it cannot name inside the dock', () => {
    renderPanel({
      criteria: makeCriteria(),
      run: makeImproveRun({
        iterations: [
          makeImproveIteration({
            reason: 'blockers to fix: contradiction|binding.2,edge.5,narration.2, c3',
          }),
        ],
      }),
      isPolling: true,
    });

    const reason = screen.getByTestId('improve-iteration-reason');
    expect(reason.textContent).toBe(
      'blockers to fix: contradiction|binding.2,edge.5,narration.2, “p99 read latency stays under 200 ms”',
    );
    expect(getComputedStyle(reason).overflowWrap).toBe('anywhere');
  });

  it('[DEL-3] a coach that produced nothing to judge says so — the stop is its miss, never a verdict on the design', () => {
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        stopReason: 'escalated',
        iterations: [
          makeImproveIteration({ iteration: 1, overall: 12.1 }),
          makeImproveIteration({
            iteration: 2,
            mode: 'revise',
            overall: null,
            decision: 'escalate',
            reason: 'no artifact to judge',
            outcome: 'no-artifact',
            revisionId: null,
          }),
        ],
      }),
    });

    const missing = screen.getByTestId('improve-iteration-2');
    expect(missing.getAttribute('data-outcome')).toBe('no-artifact');
    expect(missing.textContent).toContain('no revision produced');
    expect(missing.textContent).toContain('—');
    expect(screen.getByTestId('improve-iteration-1').textContent).toContain('12');
    expect(screen.getByTestId('improve-iteration-1').textContent).not.toContain('12.1');
    expect(screen.getByTestId('improvement-stopped').textContent).toBe(
      'The coach could not produce a revision this time — try again.',
    );
  });

  it('[UX-11] an escalation with a revision to judge says the loop needs a person, not that the design could not be scored', () => {
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        stopReason: 'escalated',
        iterations: [makeImproveIteration({ iteration: 1, decision: 'escalate' })],
      }),
    });
    const stopped = screen.getByTestId('improvement-stopped').textContent ?? '';
    expect(stopped).toContain('needs a person');
    expect(stopped).not.toContain('could not score');
  });

  it('[UX-11] a failed run is reported as a failure, and the previous run’s best stays one click away', async () => {
    const onLoadRevision = vi.fn();
    renderPanel({
      run: makeImproveRun({ status: 'failed', iterations: [], error: 'the model went away' }),
      error: 'the model went away',
      earlierBest: makeRevisionSummary({
        id: 'rev-4',
        revisionNumber: 4,
        origin: 'assistant',
        evaluation: {
          runId: 'run-1',
          iteration: 2,
          status: 'complete',
          overall: 80.4,
          decision: 'accept',
        },
      }),
      onLoadRevision,
    });

    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('data-testid')).toBe('improvement-error');
    expect(alert.textContent).toContain('The coach run failed');
    expect(alert.textContent).toContain('the model went away');
    expect(screen.getByTestId('earlier-best').textContent).toContain('revision #4, scored 80');
    await userEvent.click(screen.getByTestId('load-earlier-best'));
    expect(onLoadRevision).toHaveBeenCalledWith('rev-4');
  });

  it('offers nothing to load when no iteration beat the draft', () => {
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        stopReason: 'max-iterations',
        iterations: [
          makeImproveIteration({
            iteration: 1,
            mode: 'provided',
            overall: 64,
            decision: 'revise',
            revisionId: 'rev-1',
          }),
          makeImproveIteration({
            iteration: 2,
            mode: 'revise',
            overall: 60,
            decision: 'revise',
            revisionId: null,
          }),
        ],
      }),
    });
    expect(screen.getByTestId('improvement-stopped').textContent).toContain('iteration budget');
    expect(screen.queryByTestId('load-best-revision')).toBeNull();
  });
});
