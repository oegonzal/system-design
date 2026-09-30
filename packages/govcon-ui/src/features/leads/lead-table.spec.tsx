import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './lead-table.stories';

const { Default, Empty, Capped } = composeStories(stories);

describe('LeadTable', () => {
  it('[GOVU-2] rows the ranking newest-best first with score, tier, deadline, set-aside, NAICS, agency, and a link per notice', () => {
    renderWithTheme(<Default />);
    const table = screen.getByRole('table', { name: 'Leads' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    const cells = within(rows[0] as HTMLElement)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells.slice(0, 7)).toEqual([
      '1',
      '71.5',
      'high',
      '2026-10-26',
      'open',
      '332710',
      'NAVSUP WEAPON SYSTEMS SUPPORT',
    ]);
    const title = within(rows[0] as HTMLElement).getByRole('link', { name: /JUNCTION BOX/ });
    expect(title.getAttribute('href')).toBe('/notices/21b781192a4f4026a2946237984a9c06');
    expect(title.getAttribute('aria-current')).toBe('true');
    expect(
      within(rows[1] as HTMLElement)
        .getByRole('link', { name: 'sam.gov' })
        .getAttribute('target'),
    ).toBe('_blank');
    expect(
      screen.getByText(
        /4 candidate\(s\) · 1 excluded by a gate · 3 over the filters · showing 1–3 of 3/,
      ),
    ).toBeTruthy();
  });

  it('[GOVU-2] says when there is nothing, and when the candidate cap cut the set', () => {
    renderWithTheme(<Empty />);
    expect(screen.getByText(/No leads/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    renderWithTheme(<Capped />);
    expect(screen.getByText(/capped — narrow the filters/)).toBeTruthy();
  });
});
