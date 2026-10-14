import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { makeImproveRun, makeRecall } from '../../testing/fixtures';
import { ImprovementPanel } from './improvement-panel';
import { LIVE, noop, renderPanel } from './testing';

describe('ImprovementPanel', () => {
  it('[QL-32] says the coach is recalling lessons before anything else moves, then how many it was handed, listed on request', async () => {
    const user = userEvent.setup();
    const recalling = makeImproveRun({
      iterations: [],
      recall: makeRecall({ status: 'recalling', count: 0, lessons: [], recallRunId: null }),
    });
    const { rerender } = renderPanel({ run: recalling, isPolling: true });
    expect(screen.getByTestId('improve-progress').textContent).toContain(
      'recalling lessons from earlier runs',
    );
    expect(screen.queryByTestId('coach-recall')).toBeNull();

    const recalled = makeImproveRun({ recall: makeRecall() });
    rerender(
      <ImprovementPanel
        run={recalled}
        error={null}
        isPolling
        message=""
        availability={LIVE}
        onStart={noop}
        onLoadRevision={noop}
      />,
    );
    expect(screen.getByTestId('improve-progress').textContent).not.toContain('recalling');
    expect(screen.getByTestId('coach-recall-summary').textContent).toBe(
      'Recalled 2 lessons from earlier runs for the coach',
    );
    const list = screen.getByTestId('coach-recall-lessons');
    expect(list.hidden).toBe(true);

    const toggle = screen.getByTestId('coach-recall-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    const lessons = within(list).getAllByTestId('coach-recall-lesson');
    expect(lessons.map((lesson) => lesson.textContent)).toEqual([
      'Put a cache in front of the primary database before adding read replicas.Where it helps: the read pathLearned from: iteration 2 of an earlier system design canvas run, decided revise, 2026-10-01',
      'Say what the queue absorbs when the downstream service slows down.Where it helps: failure handlingKeep in mind: learned on a different promptLearned from: iteration 1 of an earlier system design run, decided accept, 2026-09-28',
    ]);
    // A lesson with nothing to keep in mind says nothing about it.
    expect(within(lessons[0]).queryByTestId('coach-recall-caveat')).toBeNull();
    expect(within(lessons[1]).getByTestId('coach-recall-caveat').textContent).toBe(
      'Keep in mind: learned on a different prompt',
    );
  });

  it('[UX-21] says where each lesson was learned, and only what the curator said in the prompt’s own terms', async () => {
    const user = userEvent.setup();
    const [learned] = makeRecall().lessons;
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        recall: makeRecall({
          count: 2,
          lessons: [
            learned,
            // Recorded before lessons carried where they were learned, and
            // whose curator named only labels that stand for nothing here.
            {
              ref: 'm4',
              serves: '',
              insight: 'Count every serial hop in the availability product.',
              caveat: null,
              text: 'Recompute availability over every serial dependency.',
              sourceRunId: 'run-older',
            },
          ],
        }),
      }),
    });
    await user.click(screen.getByTestId('coach-recall-toggle'));
    const [first, older] = within(screen.getByTestId('coach-recall-lessons')).getAllByTestId(
      'coach-recall-lesson',
    );
    expect(within(first).getByTestId('coach-recall-learned').textContent).toBe(
      'Learned from: iteration 2 of an earlier system design canvas run, decided revise, 2026-10-01',
    );
    expect(older.textContent).toBe('Count every serial hop in the availability product.');
    expect(within(older).queryByTestId('coach-recall-serves')).toBeNull();
    expect(within(older).queryByTestId('coach-recall-learned')).toBeNull();
  });

  it('[QL-32] [QL-34] says what the recall searched for beside the prompt — the starting grade’s defects — next to the lessons', () => {
    const { unmount } = renderPanel({
      run: makeImproveRun({
        status: 'complete',
        recall: makeRecall({
          focus: {
            runId: 'run-1',
            iteration: 1,
            findings: [
              { type: 'unhandled_failure', severity: 'high', rationale: 'one replica' },
              { type: 'unhandled_failure', severity: 'high', rationale: 'one cache' },
              { type: 'data_integrity', severity: 'medium', rationale: null },
            ],
            criteria: [
              { criterionId: 'c1', statement: 'Reads stay fast', result: 'fail' },
              { criterionId: 'c4', statement: 'Counts lag by minutes', result: 'partial' },
            ],
          },
        }),
      }),
    });
    expect(screen.getByTestId('coach-recall-summary').textContent).toBe(
      'Recalled 2 lessons from earlier runs for the coach',
    );
    // Beside the list, not behind its toggle: each kind of defect once, then each shortfall.
    expect(screen.getByTestId('coach-recall-focus').textContent).toBe(
      'Searched for what the starting grade found wrong: unhandled failure, data integrity, c1 not met, and c4 met in part.',
    );
    unmount();

    // A recall over the prompt alone names no focus.
    renderPanel({ run: makeImproveRun({ status: 'complete', recall: makeRecall() }) });
    expect(screen.queryByTestId('coach-recall-focus')).toBeNull();
  });

  it('[QL-32] says plainly when the coach ran without lessons, and nothing when the run never recalled', () => {
    const { unmount } = renderPanel({
      run: makeImproveRun({
        status: 'complete',
        recall: makeRecall({
          status: 'skipped',
          reason: 'store-unavailable',
          count: 0,
          lessons: [],
        }),
      }),
    });
    const skipped = screen.getByTestId('coach-recall');
    expect(skipped.dataset['status']).toBe('skipped');
    expect(skipped.textContent).toBe(
      'The coach ran without lessons from earlier runs: the lesson store could not be reached.',
    );
    unmount();

    const empty = renderPanel({
      run: makeImproveRun({
        status: 'complete',
        recall: makeRecall({ status: 'empty', reason: 'store-empty', count: 0, lessons: [] }),
      }),
    });
    expect(screen.getByTestId('coach-recall').textContent).toContain(
      'No lessons from earlier runs',
    );
    empty.unmount();

    renderPanel({ run: makeImproveRun({ status: 'complete', recall: null }) });
    expect(screen.queryByTestId('coach-recall')).toBeNull();
  });
});
