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
});
