import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './due-soon.stories';

const { Default, Quiet } = composeStories(stories);

describe('DueSoon', () => {
  it('[GOVU-1] [GOVU-26] lists what is due inside the week — tracked notices by reminder or deadline, tracked firms and awards by reminder — in one table, soonest first, each a link to its page', () => {
    renderWithTheme(<Default />);
    const rows = within(screen.getByRole('table', { name: 'Due this week' }))
      .getAllByRole('row')
      .slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ),
    ).toEqual([
      [
        'watching',
        'Sources Sought: Custom Software Development Services',
        '—',
        '2026-09-28',
        '2 day(s)',
      ],
      ['Firm · contacted', 'BOOZ ALLEN HAMILTON INC', '—', '2026-09-29', '4 day(s)'],
      [
        'qualifying',
        '59--JUNCTION BOX, IN REPAIR/MODIFICATION OF',
        '2026-10-26',
        '2026-10-01',
        '5 day(s)',
      ],
    ]);
    expect(rows.map((row) => within(row).getByRole('link').getAttribute('href'))).toEqual([
      expect.stringMatching(/^\/notices\//),
      expect.stringMatching(/^\/primes\//),
      '/notices/21b781192a4f4026a2946237984a9c06',
    ]);
  });

  it('says when nothing is due', () => {
    renderWithTheme(<Quiet />);
    expect(screen.getByText(/Nothing due inside 7 days/)).toBeTruthy();
  });
});
