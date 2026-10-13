import { fireEvent, render, screen, within } from '@testing-library/react';
import { composeStories } from '@storybook/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './column-chart.stories';

const { Stacked, Grouped, Negative, SingleSeries, Empty, Pending } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('ColumnChart', () => {
  it('names the svg, shows a legend only for two or more series, and twins the plot with a data table', () => {
    renderWithTheme(<Stacked />);
    expect(screen.getByRole('img', { name: 'Obligations by fiscal period' })).toBeTruthy();
    const legend = screen.getByLabelText('Obligations by fiscal period legend');
    expect(within(legend).getByText('Contracts')).toBeTruthy();
    expect(within(legend).getByText('IDVs')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Data table' }));
    const table = screen.getByRole('table', { name: 'Obligations by fiscal period table' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Period', 'Contracts', 'IDVs']);
    expect(within(table).getByRole('rowheader', { name: 'Oct' })).toBeTruthy();
    expect(within(table).getByText('$400,000')).toBeTruthy();
    expect(screen.getByText('Obligations, USD')).toBeTruthy();
  });

  it('marks projected cells and their band, and provisional cells, in the table twin', () => {
    renderWithTheme(<Grouped />);
    fireEvent.click(screen.getByRole('button', { name: 'Data table' }));
    const table = screen.getByRole('table', { name: 'Obligations by fiscal period table' });
    expect(within(table).getAllByText(/\(projected\) · \$/).length).toBe(3);
    expect(within(table).getAllByText(/\(provisional\)/).length).toBe(1);
    expect(screen.getByRole('img').querySelectorAll('pattern').length).toBe(4);
    expect(screen.getByRole('img').querySelectorAll('path[stroke-width="1.5"]').length).toBe(3);
  });

  it('draws a negative column below the baseline and labels the one peak', () => {
    renderWithTheme(<Negative />);
    expect(screen.getByRole('img').querySelectorAll('path').length).toBe(6);
    expect(screen.getByText('500K')).toBeTruthy();
    expect(screen.getByText('-200K')).toBeTruthy();
  });

  it('skips the legend for one series', () => {
    renderWithTheme(<SingleSeries />);
    expect(screen.getByRole('img')).toBeTruthy();
    expect(screen.queryByLabelText(/legend$/)).toBeNull();
  });

  it('says when there is nothing to chart, and dims while pending', () => {
    const { unmount } = renderWithTheme(<Empty />);
    expect(screen.getByText('No periods in the window.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    unmount();
    renderWithTheme(<Pending />);
    expect(document.querySelector('figure[aria-busy="true"]')).toBeTruthy();
    expect(screen.getByRole('img').querySelector('g[opacity="0.45"]')).toBeTruthy();
  });

  it('refuses more series than the theme has slots', () => {
    expect(() =>
      renderWithTheme(
        <Stacked
          series={['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, label: id }))}
          data={[{ label: 'x', values: { a: 1 } }]}
        />,
      ),
    ).toThrow(/at most 4 series/);
  });
});
