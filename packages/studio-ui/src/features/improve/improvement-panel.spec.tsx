import {
  DEFAULT_IMPROVE_ITERATIONS,
  describeInFlight,
  describeUnassessedBase,
  MAX_IMPROVE_ITERATIONS,
  PROMPT_COPY,
} from '@sysdesign/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeImproveIteration, makeImproveRun } from '../../testing/fixtures';
import { ImprovementPanel } from './improvement-panel';
import { LIVE, noop, renderPanel } from './testing';

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

  it('[UX-18] is off with why when the revision it would start from has a grade that is no verdict', () => {
    const reason = describeUnassessedBase(1);
    renderPanel({ blockedReason: reason });
    const start = screen.getByTestId('improve-run') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(start.title).toBe(reason);
    expect(screen.getByTestId('improver-unavailable').textContent).toBe(reason);
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
      'Below the accept threshold — 1 fix to make.',
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

  it('[EVAL-1] a live run says how long it has been going from its own start, and says when the grader has gone quiet', () => {
    const fresh = renderPanel({
      run: makeImproveRun({
        startedAt: new Date(Date.now() - 95_000).toISOString(),
        heartbeatAt: new Date(Date.now() - 20_000).toISOString(),
        readAt: new Date().toISOString(),
      }),
      isPolling: true,
    });
    expect(screen.getByTestId('coach-duration').textContent).toMatch(
      /^1:3\d since the coach started\.$/,
    );
    expect(screen.queryByTestId('coach-silence')).toBeNull();
    fresh.unmount();

    // On the server's clock, an hour ahead of the page's: the page would
    // have read this beat as in its future, and the silence as none.
    const server = Date.now() + 3_600_000;
    const quiet = renderPanel({
      run: makeImproveRun({
        startedAt: new Date(server - 500_000).toISOString(),
        heartbeatAt: new Date(server - 250_000).toISOString(),
        readAt: new Date(server).toISOString(),
      }),
      isPolling: true,
    });
    const silence = screen.getByTestId('coach-silence');
    expect(silence.textContent).toContain('The grader has not reported for 4 minutes.');
    expect(silence.getAttribute('data-minutes')).toBe('4');
    expect(screen.getByTestId('improve-progress').textContent).toContain('Coaching');
    expect(screen.queryByTestId('improvement-error')).toBeNull();
    quiet.unmount();

    // A run that has ended keeps no clock and raises no alarm, however old its last beat.
    renderPanel({
      run: makeImproveRun({ status: 'complete', stopReason: 'max-iterations' }),
    });
    expect(screen.queryByTestId('coach-duration')).toBeNull();
    expect(screen.queryByTestId('coach-silence')).toBeNull();
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
});
