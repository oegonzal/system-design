import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('answers hover and focus on a datum with one tooltip naming every series at that x, lifts its columns, moves with the arrow keys, and hides on leave or Escape', () => {
    renderWithTheme(<Grouped />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    const group = screen.getByRole('group', { name: 'Obligations by fiscal period values' });
    const jun = within(group).getByRole('button', { name: /^Jun:/ });
    expect(within(group).getAllByRole('button')).toHaveLength(12);
    expect(jun.getAttribute('aria-label')).toContain('FY2026 $1,080,000 (provisional)');

    fireEvent.mouseEnter(jun);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain('Jun');
    for (const label of ['FY2026', 'FY2025', 'FY2024', 'FY2023']) {
      expect(tooltip.textContent).toContain(label);
    }
    expect(tooltip.textContent).toContain('$1,080,000');
    expect(tooltip.textContent).toContain('(provisional)');
    expect(screen.getByRole('img').querySelectorAll('[data-lift]')).toHaveLength(4);

    fireEvent.mouseLeave(group);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByRole('img').querySelectorAll('[data-lift]')).toHaveLength(0);

    // A real focus, so the arrow keys have a focused target to move from.
    act(() => jun.focus());
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(within(group).getByRole('button', { name: /^Jul:/ }));
    expect(screen.getByRole('tooltip').textContent).toContain('Jul');
    expect(screen.getByRole('tooltip').textContent).toContain('(projected)');
    fireEvent.keyDown(group, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
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
