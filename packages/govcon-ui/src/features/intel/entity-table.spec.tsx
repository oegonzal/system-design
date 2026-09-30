import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './entity-table.stories';

const { Default, None, Unknown } = composeStories(stories);

describe('EntityTable', () => {
  it('[GOVU-9] rows each registrant with its status, expiry, exclusion and small-business count, and names the unknown UEIs', () => {
    renderWithTheme(<Default />);
    const rows = within(screen.getByRole('table', { name: 'Registrants' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      'PRECISION PARTS CO',
      'ABC123DEF456',
      '1AB23',
      'Active',
      '2027-03-01',
      'no',
      '1 of 1 NAICS',
    ]);
    expect(
      within(rows[1] as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      'BARRED CO',
      'BAD123456789',
      '—',
      'Expired',
      '2025-01-01',
      'excluded',
      '0 of 1 NAICS',
    ]);
    expect(screen.getByText(/Not in the registry: ZZZ000000001/)).toBeTruthy();
    expect(screen.getByText(/2 of 1000 SAM\.gov attempts/)).toBeTruthy();
  });

  it('says when nothing was looked up, and when the registry knew none', () => {
    renderWithTheme(<None />);
    expect(screen.getByText('No lookup yet.')).toBeTruthy();
    renderWithTheme(<Unknown />);
    expect(screen.getByText(/knew none of them/)).toBeTruthy();
  });
});
