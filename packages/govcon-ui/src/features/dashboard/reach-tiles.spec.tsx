import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './reach-tiles.stories';

const { Default, Nothing } = composeStories(stories);

describe('ReachTiles', () => {
  it('[GOVU-26] shows each cut of the year’s new contracts as a tile — how many, its share of the new ones and what was obligated — with a link to the lens that ranks who won each, and where the figures came from', () => {
    renderWithTheme(<Default />);
    const tiles = within(screen.getByLabelText('Reach by cut')).getAllByText(/of new/);
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      '100% of new · $96M',
      '64.6% of new · $52M',
      '12.9% of new · $21M',
      '8.5% of new · $9.5M',
    ]);
    expect(screen.getByText('4,800')).toBeTruthy();
    expect(screen.getByText('Won by a small business')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Who won each cut, on the Reach lens' })
        .getAttribute('href'),
    ).toBe('/spending?tab=reach');
    expect(screen.getByText(/usaspending · data as of/)).toBeTruthy();
  });

  it('[GOVU-26] says a dash for a share when the scope has no new contracts, never a division by nothing', () => {
    renderWithTheme(<Nothing />);
    expect(
      within(screen.getByLabelText('Reach by cut'))
        .getAllByText(/of new/)
        .map((tile) => tile.textContent),
    ).toEqual(['— of new · $0', '— of new · $0', '— of new · $0', '— of new · $0']);
  });
});
