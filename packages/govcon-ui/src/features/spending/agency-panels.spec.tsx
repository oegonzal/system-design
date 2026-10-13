import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AGENCIES } from '../../testing/spending-fixtures';
import { AgencyDirectoryTable } from './agency-panels';
import * as stories from './agency-panels.stories';

const { Outlook, SubAgencies, NoSubAgencies } = composeStories(stories);

describe('the agency panels', () => {
  it('[GOVU-11] lists the directory with a View per agency, marking the one open', () => {
    const onSelect = vi.fn();
    renderWithTheme(
      <AgencyDirectoryTable agencies={AGENCIES.entries} selected="097" onSelect={onSelect} />,
    );
    const table = screen.getByRole('table', { name: 'Agencies' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('DOD — Department of Defense')).toBeTruthy();
    expect(
      within(table).getByRole('button', { name: 'Viewing' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(within(table).getAllByRole('button', { name: 'View' })[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith('036');
  });

  it('[GOVU-11] tiles the latest year’s resources, obligations and headroom, and charts obligations to date by period with a data table', () => {
    renderWithTheme(<Outlook />);
    expect(screen.getByRole('heading', { name: 'DOD — Department of Defense' })).toBeTruthy();
    const grid = screen.getByLabelText('FY2026 resources');
    expect(within(grid).getByText('$1.3T')).toBeTruthy();
    expect(within(grid).getByText('$640B')).toBeTruthy();
    expect(within(grid).getByText('$660B')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Obligations to date by period' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Data table' }));
    const table = screen.getByRole('table', { name: 'Obligations to date by period table' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Period', 'FY2026', 'FY2025', 'FY2024', 'FY2023']);
  });

  it('[GOVU-11] lists sub-agencies with their offices folded under each, and says when there are none', () => {
    renderWithTheme(<SubAgencies />);
    const table = screen.getByRole('table', { name: 'Sub-agencies' });
    expect(within(table).getByText('USN — Department of the Navy')).toBeTruthy();
    fireEvent.click(within(table).getByRole('button', { name: 'Offices (2)' }));
    expect(
      within(screen.getByRole('table', { name: 'Offices' })).getByText('NAVSEA HQ'),
    ).toBeTruthy();
    expect(screen.getByText(/more sub-agencies exist/)).toBeTruthy();
    renderWithTheme(<NoSubAgencies />);
    expect(screen.getByText(/No idvs obligations reported by sub-agency for FY2026/)).toBeTruthy();
  });
});
