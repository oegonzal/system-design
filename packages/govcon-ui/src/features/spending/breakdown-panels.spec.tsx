import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BreakdownControls } from './breakdown-panels';
import * as stories from './breakdown-panels.stories';

const { List, Truncated, Empty } = composeStories(stories);

describe('the breakdown panels', () => {
  it('[GOVU-11] ranks the rows as shares of the scope’s whole, with the window and the total above', () => {
    renderWithTheme(<List />);
    expect(screen.getByText('$8M')).toBeTruthy();
    expect(screen.getByText('2025-10-01 → 2026-06-15')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Obligations by awarding agency' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(within(rows[0] as HTMLElement).getByText('Department of Defense')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('77.5%')).toBeTruthy();
    expect(screen.queryByText(/More rows exist/)).toBeNull();
    renderWithTheme(<Truncated />);
    expect(screen.getByText(/More rows exist/)).toBeTruthy();
    renderWithTheme(<Empty />);
    expect(screen.getByText('Nothing obligated by awarding agency in the window.')).toBeTruthy();
  });

  it('[GOVU-11] offers every category and window preset', () => {
    const onCategoryChange = vi.fn();
    const onPresetChange = vi.fn();
    renderWithTheme(
      <BreakdownControls
        category="awarding_agency"
        onCategoryChange={onCategoryChange}
        preset="fytd"
        onPresetChange={onPresetChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Rank by'), { target: { value: 'recipient' } });
    expect(onCategoryChange).toHaveBeenCalledWith('recipient');
    expect(
      screen.getByRole('button', { name: 'Fiscal year to date' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Prior fiscal year' }));
    expect(onPresetChange).toHaveBeenCalledWith('prior-fy');
  });
});
