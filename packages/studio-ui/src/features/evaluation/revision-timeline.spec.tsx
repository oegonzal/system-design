import { describeLostGrade } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeRevisionSummary } from '../../testing/fixtures';
import { RevisionTimeline } from './revision-timeline';

const revisions = [
  makeRevisionSummary(),
  makeRevisionSummary({
    id: 'rev-2',
    revisionNumber: 2,
    origin: 'assistant',
    evaluation: {
      runId: 'run-2',
      iteration: 2,
      status: 'complete',
      overall: 80.6,
      decision: 'accept',
    },
  }),
];

describe('RevisionTimeline', () => {
  it('[EVAL-3] lists revisions newest first, scores printed as the summary prints them, and marks the one on screen as current', async () => {
    const onSelect = vi.fn();
    renderWithTheme(
      <RevisionTimeline revisions={revisions} activeRevisionId="rev-2" onSelect={onSelect} />,
    );

    const chips = screen.getAllByRole('button');
    expect(chips.map((chip) => chip.getAttribute('data-testid'))).toEqual([
      'revision-chip-2',
      'revision-chip-1',
    ]);
    expect(screen.getByTestId('revision-chip-2').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('revision-chip-1').hasAttribute('aria-current')).toBe(false);
    expect(screen.getAllByTestId('revision-score').map((score) => score.textContent)).toEqual([
      '81',
      '72',
    ]);

    await userEvent.click(screen.getByTestId('revision-chip-1'));
    expect(onSelect).toHaveBeenCalledWith(revisions[0]);
  });

  it('[UX-17] says a grade the grader lost apart from one that failed, with the studio’s sentence as its title', () => {
    renderWithTheme(
      <RevisionTimeline
        revisions={[
          makeRevisionSummary({
            id: 'rev-3',
            revisionNumber: 3,
            evaluation: {
              runId: 'run-3',
              iteration: 1,
              status: 'failed',
              overall: null,
              decision: null,
              error: describeLostGrade(3),
            },
          }),
          makeRevisionSummary({
            id: 'rev-2',
            revisionNumber: 2,
            evaluation: {
              runId: 'run-2',
              iteration: 1,
              status: 'failed',
              overall: null,
              decision: null,
            },
          }),
          makeRevisionSummary({
            id: 'rev-1',
            revisionNumber: 1,
            evaluation: {
              runId: 'run-1',
              iteration: 1,
              status: 'running',
              overall: null,
              decision: null,
            },
          }),
        ]}
        onSelect={vi.fn()}
      />,
    );

    const lost = screen
      .getByTestId('revision-chip-3')
      .querySelector('[data-testid="revision-grade-failed"]');
    expect(lost?.textContent).toBe('grade lost');
    expect(lost?.getAttribute('title')).toBe(
      'The grader no longer has the run that graded revision #3 — grade it again to get a verdict.',
    );
    const failed = screen
      .getByTestId('revision-chip-2')
      .querySelector('[data-testid="revision-grade-failed"]');
    expect(failed?.textContent).toBe('failed');
    expect(failed?.hasAttribute('title')).toBe(false);
    expect(screen.getByTestId('revision-chip-1').textContent).toContain('grading…');
    expect(screen.queryAllByTestId('revision-score')).toHaveLength(0);
  });

  it('[UX-15] calls a chip current only when the canvas shows that revision, and says apart whose feedback is on show', () => {
    // A revision on the canvas, its own feedback beside it: one chip, both things.
    const viewing = renderWithTheme(
      <RevisionTimeline
        revisions={revisions}
        activeRevisionId="rev-2"
        feedbackRevisionId="rev-2"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId('revision-chip-2').getAttribute('aria-current')).toBe('true');
    expect(screen.getAllByTestId('revision-place').map((place) => place.textContent)).toEqual([
      'on canvas',
    ]);
    viewing.unmount();

    // The canvas shows the draft: nothing is current, and the feedback's revision says so.
    renderWithTheme(
      <RevisionTimeline
        revisions={revisions}
        activeRevisionId={null}
        feedbackRevisionId="rev-1"
        onSelect={vi.fn()}
      />,
    );
    for (const chip of screen.getAllByRole('button')) {
      expect(chip.hasAttribute('aria-current')).toBe(false);
    }
    const feedback = screen.getByTestId('revision-chip-1');
    expect(feedback.getAttribute('data-place')).toBe('feedback');
    expect(feedback.textContent).toContain('feedback shown');
    expect(screen.getByTestId('revision-chip-2').hasAttribute('data-place')).toBe(false);
  });
});
