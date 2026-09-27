import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import * as stories from './lead-table.stories';

const { Default, Empty } = composeStories(stories);

describe('LeadTable', () => {
  it('[GOVU-2] lists the leads in rank order with score, tier, deadline, set-aside, NAICS, agency and a sam.gov link, marking the open one', () => {
    renderWithTheme(<Default />);
    expect(
      screen.getByText('4 candidate(s) · 1 excluded by a gate · 3 over the filters · 3 shown'),
    ).toBeTruthy();
    const table = within(screen.getByRole('table', { name: 'Leads' }));
    const rows = table.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[1]?.textContent)).toEqual([
      '71.5',
      '59.5',
      '32.0',
    ]);
    expect(rows.map((row) => within(row).getAllByRole('cell')[2]?.textContent)).toEqual([
      'high',
      'medium',
      'low',
    ]);
    expect(within(rows[0] as HTMLElement).getAllByRole('cell')[3]?.textContent).toBe('2026-10-26');
    expect(within(rows[2] as HTMLElement).getAllByRole('cell')[4]?.textContent).toBe('SBA');
    expect(within(rows[0] as HTMLElement).getAllByRole('cell')[6]?.textContent).toBe(
      'NAVSUP WEAPON SYSTEMS SUPPORT',
    );

    const buttons = table.getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-current'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    const link = within(rows[0] as HTMLElement).getByRole('link', { name: 'sam.gov' });
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(link.getAttribute('href')).toContain('21b781192a4f4026a2946237984a9c06');
  });

  it('[GOVU-2] reports the clicked notice by id', () => {
    const onSelect = fn();
    renderWithTheme(<Default onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /JUNCTION BOX/ }));
    expect(onSelect).toHaveBeenCalledWith('21b781192a4f4026a2946237984a9c06');
  });

  it('says so when there is nothing to show, without an empty table', () => {
    renderWithTheme(<Empty />);
    expect(screen.getByText(/No leads — pull first/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
