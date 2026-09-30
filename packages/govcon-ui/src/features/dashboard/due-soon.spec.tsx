import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './due-soon.stories';

const { Default, Quiet } = composeStories(stories);

describe('DueSoon', () => {
  it('[GOVU-1] lists the tracked notices due inside the week by reminder or deadline, soonest mark first', () => {
    renderWithTheme(<Default />);
    const rows = within(screen.getByRole('table', { name: 'Due this week' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0] as HTMLElement)
        .getByRole('link', { name: /JUNCTION BOX/ })
        .getAttribute('href'),
    ).toBe('/notices/21b781192a4f4026a2946237984a9c06');
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual([
      'qualifying',
      '59--JUNCTION BOX, IN REPAIR/MODIFICATION OF',
      '2026-10-26',
      '2026-10-01',
      '5 day(s)',
    ]);
    expect(
      within(rows[1] as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual([
      'watching',
      'Sources Sought: Custom Software Development Services',
      '—',
      '2026-09-28',
      '2 day(s)',
    ]);
  });

  it('says when nothing is due', () => {
    renderWithTheme(<Quiet />);
    expect(screen.getByText(/Nothing due inside 7 days/)).toBeTruthy();
  });
});
