import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import { SAVED_SEARCHES } from '../../testing/fixtures';
import * as stories from './saved-search-list.stories';

const { Default, Busy, Empty, SourceDisabled } = composeStories(stories);

describe('SavedSearchList', () => {
  it('[GOVU-6] rows each saved search with its filters, days, pull flag and order, last run, and the three actions', () => {
    const onToggleIncluded = fn();
    const onOrderChange = fn();
    const onRun = fn();
    const onEdit = fn();
    const onDelete = fn();
    renderWithTheme(
      <Default
        onToggleIncluded={onToggleIncluded}
        onOrderChange={onOrderChange}
        onRun={onRun}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    const rows = within(screen.getByRole('table', { name: 'Saved searches' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(3);
    const first = rows[0] as HTMLElement;
    expect(
      within(first)
        .getAllByRole('cell')
        .slice(0, 3)
        .map((cell) => cell.textContent),
    ).toEqual(['Machine shops', 'naics=332710', '3']);
    expect(within(rows[1] as HTMLElement).getAllByRole('cell')[1]?.textContent).toBe(
      'naics=541511 status=active',
    );
    expect(within(rows[1] as HTMLElement).getAllByRole('cell')[5]?.textContent).toBe(
      '2026-09-26 19:10',
    );
    expect(within(first).getAllByRole('cell')[5]?.textContent).toBe('never');

    fireEvent.click(screen.getByLabelText('Include Machine shops in the daily pull'));
    expect(onToggleIncluded).toHaveBeenLastCalledWith(SAVED_SEARCHES[0], false);
    fireEvent.change(screen.getByLabelText('Pull order of Machine shops'), {
      target: { value: '5' },
    });
    expect(onOrderChange).toHaveBeenLastCalledWith(SAVED_SEARCHES[0], 5);
    fireEvent.click(
      screen.getByRole('button', { name: 'Run Brackets anywhere (1 request per page)' }),
    );
    expect(onRun).toHaveBeenLastCalledWith(SAVED_SEARCHES[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Custom programming' }));
    expect(onEdit).toHaveBeenLastCalledWith(SAVED_SEARCHES[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Custom programming' }));
    expect(onDelete).toHaveBeenLastCalledWith(SAVED_SEARCHES[1]);
  });

  it('waits on the busy row, keeps runs off without a source, and says when there is nothing', () => {
    renderWithTheme(<Busy />);
    expect(
      (
        screen.getByRole('button', {
          name: 'Run Machine shops (1 request per page)',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Run Custom programming (1 request per page)',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    renderWithTheme(<SourceDisabled />);
    expect(
      (
        screen
          .getAllByRole('button', { name: 'Run Machine shops (1 request per page)' })
          .at(-1) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getAllByRole('button', { name: 'Edit Machine shops' }).at(-1) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    renderWithTheme(<Empty />);
    expect(screen.getByText(/None yet/)).toBeTruthy();
  });
});
