import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Table } from './table';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Table', () => {
  it('is a real table, found by its label, with real column headers', () => {
    renderWithTheme(
      <Table aria-label="Leads">
        <thead>
          <tr>
            <th>Score</th>
            <th>Title</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>71.5</td>
            <td>Junction box</td>
          </tr>
        </tbody>
      </Table>,
    );
    const table = screen.getByRole('table', { name: 'Leads' });
    expect(table.tagName).toBe('TABLE');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Score', 'Title']);
    expect(within(table).getByRole('cell', { name: 'Junction box' })).toBeTruthy();
  });
});
