import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeImprovementRun } from '../../testing/fixtures';
import { renderWithTheme } from '../../testing/render';
import { ImprovementPanel } from './improvement-panel';

const noop = () => undefined;

describe('ImprovementPanel', () => {
  it('explains the coach when idle, including an honest disabled reason', () => {
    renderWithTheme(
      <ImprovementPanel
        run={null}
        error={null}
        isPolling={false}
        message=""
        availability={{ enabled: false, model: null, reason: 'no-key' }}
        onCancel={noop}
        onLoadRevision={noop}
      />,
    );
    expect(screen.getByTestId('improver-unavailable').textContent).toContain('ANTHROPIC_API_KEY');
  });

  it('renders the live trajectory with accepted/rejected verdicts and a stop control', () => {
    renderWithTheme(
      <ImprovementPanel
        run={makeImprovementRun({
          status: 'running',
          iterations: [
            {
              iteration: 0,
              proposer: 'baseline',
              description: 'The design as submitted.',
              score: 41,
              accepted: true,
              revisionId: 'rev-1',
            },
            {
              iteration: 1,
              proposer: 'llm',
              description: 'Add a read replica.',
              score: 55,
              accepted: true,
              revisionId: 'rev-2',
            },
            {
              iteration: 2,
              proposer: 'llm',
              description: 'Rename a label.',
              score: 55,
              accepted: false,
              revisionId: null,
              rejectedReason: 'not-better',
            },
          ],
        })}
        error={null}
        isPolling
        message="Coach iteration 2 of 6 — score 55."
        availability={{ enabled: true, model: 'claude', reason: null }}
        onCancel={noop}
        onLoadRevision={noop}
      />,
    );

    expect(screen.getByTestId('improve-iteration-0').textContent).toContain('baseline');
    expect(screen.getByTestId('improve-iteration-1').textContent).toContain('accepted');
    expect(screen.getByTestId('improve-iteration-2').textContent).toContain('not better');
    expect(screen.getByTestId('cancel-improvement')).toBeTruthy();
    // No load button while the run is still active.
    expect(screen.queryByTestId('load-best-revision')).toBeNull();
  });

  it('offers to load the best revision once completed, wired to its id', async () => {
    const onLoadRevision = vi.fn();
    renderWithTheme(
      <ImprovementPanel
        run={makeImprovementRun({
          status: 'completed',
          stoppedReason: 'plateau',
          bestRevisionId: 'rev-9',
          iterations: [
            {
              iteration: 0,
              proposer: 'baseline',
              description: 'The design as submitted.',
              score: 41,
              accepted: true,
              revisionId: 'rev-1',
            },
            {
              iteration: 1,
              proposer: 'llm',
              description: 'Add a walkthrough.',
              score: 72,
              accepted: true,
              revisionId: 'rev-9',
            },
          ],
        })}
        error={null}
        isPolling={false}
        message="Coach finished."
        availability={{ enabled: true, model: 'claude', reason: null }}
        onCancel={noop}
        onLoadRevision={onLoadRevision}
      />,
    );

    expect(screen.getByTestId('improvement-stopped').textContent).toContain('plateaued');
    await userEvent.click(screen.getByTestId('load-best-revision'));
    expect(onLoadRevision).toHaveBeenCalledWith('rev-9');
  });
});
