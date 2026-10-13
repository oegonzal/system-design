import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HorizonMonths } from './horizon-panels';
import * as stories from './horizon-panels.stories';

const { Chart, Tiles, Capped, Unreached, Rows, NoRows } = composeStories(stories);

describe('the horizon panels', () => {
  it('[GOVU-11] charts the months ahead with both families and a data table, and tiles what ends in the window', () => {
    renderWithTheme(<Chart />);
    expect(screen.getByRole('img', { name: 'Expiring awards by month' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Data table' }));
    const table = screen.getByRole('table', { name: 'Expiring awards by month table' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Month', 'Contracts', 'IDVs']);
    expect(within(table).getByRole('rowheader', { name: 'Jun 2026' })).toBeTruthy();
    expect(within(table).getByRole('rowheader', { name: 'May 2027' })).toBeTruthy();

    renderWithTheme(<Tiles />);
    const grid = screen.getByLabelText('Ending inside the window');
    expect(within(grid).getByText('Contracts ending')).toBeTruthy();
    expect(within(grid).getByText('12 months')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    renderWithTheme(<Capped />);
    expect(screen.getByRole('alert').textContent).toContain(
      'complete only for awards ending after 2026-11-30',
    );
    renderWithTheme(<Unreached />);
    expect(screen.getAllByRole('alert').at(-1)?.textContent).toContain(
      'before it reached the window: every award it read ends after 2027-05-31. Narrow the scope',
    );
  });

  it('[GOVU-11] lists the soonest-ending rows with their family, pages them, and says when there are none', () => {
    renderWithTheme(<Rows />);
    const table = screen.getByRole('table', { name: 'Expiring awards' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText('N6660426P0205')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('Contracts')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('IDVs')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('Department of the Navy')).toBeTruthy();
    expect(screen.getByText('1–2 of 2')).toBeTruthy();
    renderWithTheme(<NoRows />);
    expect(screen.getByText(/No award in the scope ends/)).toBeTruthy();

    const onChange = vi.fn();
    renderWithTheme(<HorizonMonths value={12} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Months ahead'), { target: { value: '24' } });
    expect(onChange).toHaveBeenCalledWith(24);
  });

  it('[GOVU-12] says which open notices already exist for an expiring award, each a link to the notice with its type and deadline, and counts the rows that have one', () => {
    renderWithTheme(<Rows />);
    const table = screen.getByRole('table', { name: 'Expiring awards' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[1] as HTMLElement).getByText('0')).toBeTruthy();
    fireEvent.click(within(rows[0] as HTMLElement).getByRole('button', { name: '1 open' }));
    const list = screen.getByRole('list', { name: 'Open notices for N6660426P0205' });
    const link = within(list).getByRole('link', {
      name: 'Additive manufacturing of replacement brackets',
    });
    expect(link.getAttribute('href')).toBe('/notices/n-1');
    expect(within(list).getByText('Solicitation · due 2026-10-10')).toBeTruthy();

    renderWithTheme(<Tiles />);
    const grid = screen.getByLabelText('Ending inside the window');
    expect(within(grid).getByText('With an open notice')).toBeTruthy();
    expect(within(grid).getByText('of 2 listed')).toBeTruthy();
  });
});
