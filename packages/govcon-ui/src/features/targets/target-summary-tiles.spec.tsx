import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './target-summary-tiles.stories';

const { Default } = composeStories(stories);

describe('TargetSummaryTiles', () => {
  it('[GOVU-20] counts each kind by its own stages, zero included, then what is due inside the week and the total', () => {
    renderWithTheme(<Default />);
    const items = (name: string) =>
      within(screen.getByRole('list', { name }))
        .getAllByRole('listitem')
        .map((item) => item.textContent);
    expect(items('Firms by stage')).toEqual([
      'Firms',
      'identified 1',
      'contacted 2',
      'talking 0',
      'teamed 0',
      'passed 1',
    ]);
    expect(items('Awards by stage')).toEqual([
      'Awards',
      'watching 3',
      'researching 1',
      'positioning 0',
      'pursuing 0',
      'passed 0',
    ]);
    expect(screen.getByText('1 due inside 7 days · 8 tracked')).toBeTruthy();
  });
});
