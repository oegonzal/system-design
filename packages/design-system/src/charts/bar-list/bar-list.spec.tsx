import { render, screen, within } from '@testing-library/react';
import { composeStories } from '@storybook/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './bar-list.stories';

const { Default, NoShare, Empty } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('BarList', () => {
  it('ranks the items as given, fills the widest bar fully, and spells value and share as text', () => {
    renderWithTheme(<Default />);
    const list = screen.getByRole('list', { name: 'Obligations by awarding agency' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('span > span')?.textContent)).toEqual([
      'Department of Defense',
      'National Aeronautics and Space Administration',
      'Department of State',
      'Department of Agriculture',
    ]);
    const fills = list.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span');
    expect(fills[0]?.style.width).toBe('100%');
    expect(within(rows[0] as HTMLElement).getByText('$6,200,000')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('77.5%')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('DOD')).toBeTruthy();
  });

  it('leaves the share column empty without a whole, and says when there is nothing', () => {
    renderWithTheme(<NoShare />);
    expect(screen.queryByText(/%$/)).toBeNull();
    renderWithTheme(<Empty />);
    expect(screen.getByText('No rows in the window.')).toBeTruthy();
  });
});
