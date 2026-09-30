import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as stories from './award-table.stories';

const { Default, Paged, Empty } = composeStories(stories);

describe('AwardTable', () => {
  it('[GOVU-9] rows every award with its money, offers, codes, agency and source', () => {
    renderWithTheme(<Default />);
    const rows = within(screen.getByRole('table', { name: 'Awards' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(3);
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      '2026-06-12',
      'PRECISION PARTS CO',
      '$52,000',
      '3',
      'SBA',
      '332710 / 5340',
      'DLA AVIATION',
      'SPE4A7-26-Q-0001',
      'sam.gov',
    ]);
    expect(
      within(rows[2] as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toContain('$17,152,539');
    expect(screen.getByText('1–3 of 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('pages when there is more than one page, and says when there is nothing', () => {
    const onPage = vi.fn();
    renderWithTheme(<Paged onPage={onPage} />);
    expect(screen.getByText('4–6 of 120')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(6);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenCalledWith(0);
    renderWithTheme(<Empty />);
    expect(screen.getByText(/No awards here/)).toBeTruthy();
  });
});
