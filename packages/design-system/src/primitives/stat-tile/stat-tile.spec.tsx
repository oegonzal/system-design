import { render, screen } from '@testing-library/react';
import { composeStories } from '@storybook/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './stat-tile.stories';

const { Default, WithDetail, Grid } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('StatTile', () => {
  it('shows the label, the figure as given, and a detail line when there is one', () => {
    renderWithTheme(<Default />);
    expect(screen.getByText('Total obligated')).toBeTruthy();
    expect(screen.getByText('$8,000,000')).toBeTruthy();
    renderWithTheme(<WithDetail />);
    expect(screen.getByText('+12% vs the prior year to date')).toBeTruthy();
  });

  it('groups tiles under a name', () => {
    renderWithTheme(<Grid />);
    const grid = screen.getByLabelText('Fiscal year to date');
    expect(grid.querySelectorAll('span').length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText('$1.8M–$2.4M')).toBeTruthy();
  });
});
