import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './pulse-panels.stories';

const { Chart, Tiles, Unprojected } = composeStories(stories);

describe('the pulse panels', () => {
  it('[GOVU-11] charts the fiscal years over twelve periods with a data table, and names the projection method', () => {
    renderWithTheme(<Chart />);
    expect(screen.getByRole('img', { name: 'Obligations by fiscal period' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Data table' }));
    const table = screen.getByRole('table', { name: 'Obligations by fiscal period table' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Period', 'FY2026', 'FY2025', 'FY2024', 'FY2023']);
    expect(within(table).getByRole('rowheader', { name: 'Oct' })).toBeTruthy();
    expect(within(table).getAllByText(/\(projected\)/)).toHaveLength(3);
    expect(
      screen.getByText(/Projection: the seasonal-mean of FY2023, FY2024, FY2025, scaled 1\.10×/),
    ).toBeTruthy();
  });

  it('[GOVU-11] tiles the year to date, the prior year to date with its change, and the projected remainder with its band', () => {
    renderWithTheme(<Tiles />);
    const grid = screen.getByLabelText('Fiscal year to date');
    expect(within(grid).getByText('Year to date')).toBeTruthy();
    expect(within(grid).getByText('FY2026 through Jun')).toBeTruthy();
    expect(within(grid).getByText(/% vs the prior year to date/)).toBeTruthy();
    expect(within(grid).getByText('Projected remainder')).toBeTruthy();
    expect(within(grid).getAllByText(/\$[\d.]+[KM]–\$[\d.]+[KM]/).length).toBe(2);
  });

  it('says when there is nothing to project from', () => {
    renderWithTheme(<Unprojected />);
    expect(screen.getByText(/No projection/)).toBeTruthy();
  });
});
