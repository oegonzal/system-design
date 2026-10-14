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

  it('[GOVU-25] says what each search’s last read of the source brought in — the day, how many records and how many new, a badge per tier the profile ranked any of them in, and what a gate keeps off the list — or that it has not read the source yet', () => {
    renderWithTheme(<Default />);
    const [never, ranked, noisy] = within(screen.getByRole('table', { name: 'Saved searches' }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[6] as HTMLElement);
    expect(
      within(screen.getByRole('table', { name: 'Saved searches' }))
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Name',
      'Filters',
      'Days',
      'In daily pull',
      'Order',
      'Last run',
      'Last read brought',
      'Actions',
    ]);
    expect(never?.textContent).toBe('not read yet');

    expect(ranked?.textContent).toContain('2026-09-26: 37 read, 5 new');
    expect(ranked?.textContent).toContain('1 high');
    expect(ranked?.textContent).toContain('3 medium');
    expect(ranked?.textContent).toContain('20 low');
    expect(ranked?.textContent).toContain('13 not listed');
    // The days it asked for are a hover away.
    expect(
      within(ranked as HTMLElement).getByTitle('Posted 2026-09-23 to 2026-09-26'),
    ).toBeTruthy();

    // A read cut short that the profile ranked none of: no tier is named, and the cut is said.
    expect(noisy?.textContent).toBe('2026-09-25: 1000 read, 0 new, more matched1000 not listed');
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
