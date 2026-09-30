import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './pipeline-summary-tiles.stories';

const { Default } = composeStories(stories);

describe('PipelineSummaryTiles', () => {
  it('[GOVU-7] counts every stage, zero included, and what is due', () => {
    renderWithTheme(<Default />);
    const items = within(screen.getByRole('list', { name: 'Pipeline summary' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent)).toEqual([
      'watching 1',
      'qualifying 1',
      'preparing 0',
      'submitted 1',
      'won 0',
      'lost 0',
      'passed 0',
      '2 due inside 7 days · 3 tracked',
    ]);
  });
});
