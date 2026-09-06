import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import { RUN_SUMMARIES } from '../../testing/fixtures';
import * as stories from './recent-runs.stories';

const { Default, Empty } = composeStories(stories);

describe('RecentRuns', () => {
  it('[QLU-4] lists the runs newest first with their outcome, marking the open one', () => {
    renderWithTheme(<Default />);

    const table = within(screen.getByRole('table', { name: 'Recent runs' }));
    const rows = table.getAllByRole('row');
    expect(rows).toHaveLength(1 + 3);
    expect(rows[1]?.textContent).toContain('running');
    expect(rows[2]?.textContent).toContain('revise');
    expect(rows[3]?.textContent).toContain('accept');
    expect(rows[3]?.textContent).toContain('100');
    const buttons = table.getAllByRole('button');
    expect(buttons[1]?.getAttribute('aria-current')).toBe('true');
    expect(buttons[0]?.getAttribute('aria-current')).toBe('false');
  });

  it('[QLU-4] reports the clicked run by id', () => {
    const onSelect = fn();
    renderWithTheme(<Default onSelect={onSelect} />);

    fireEvent.click(within(screen.getByRole('table')).getAllByRole('button')[2] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(RUN_SUMMARIES[2]?.runId);
  });

  it('says so when there is nothing yet', () => {
    renderWithTheme(<Empty />);
    expect(screen.getByText('No runs yet.')).toBeTruthy();
  });
});
