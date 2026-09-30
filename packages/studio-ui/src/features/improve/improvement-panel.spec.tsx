import { DEFAULT_IMPROVE_ITERATIONS, MAX_IMPROVE_ITERATIONS } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeImproveIteration, makeImproveRun } from '../../testing/fixtures';
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
    expect(screen.getByTestId('improver-unavailable').textContent).toContain('archived');
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

    expect(screen.getByText('Coaching — 7 model calls so far…')).toBeTruthy();
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
