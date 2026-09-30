import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import * as stories from './awards-panel.stories';

const { Default, LookedUp, LookingUp, Empty } = composeStories(stories);

describe('AwardsPanel', () => {
  it('[GOVU-8] tables the awards of the solicitation with what was paid, to whom and against how many, and summarizes the NAICS', () => {
    const onLookup = fn();
    renderWithTheme(<Default onLookup={onLookup} />);
    const rows = within(screen.getByRole('table', { name: 'Awards on this solicitation' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('cell')
        .slice(0, 6)
        .map((c) => c.textContent),
    ).toEqual(['sam.gov', 'PRECISION PARTS CO', '$52,000', '3', 'SBA', '2026-06-12']);
    fireEvent.click(
      within(rows[0] as HTMLElement).getByRole('button', { name: 'Look up awardee (1 request)' }),
    );
    expect(onLookup).toHaveBeenCalledWith('ABC123DEF456');
    const summary = within(
      screen.getByRole('list', { name: 'Related awards summary' }),
    ).getAllByRole('listitem');
    expect(summary.map((item) => item.textContent)).toEqual([
      '3 award(s) · $156,000 in all · median $52,000',
      'Competition: one offer 1 · 2–4 offers 2 · 5+ offers 0 · unknown 0',
      'Set-asides: SBA 2 · open 1',
      'Winning most: PRECISION PARTS CO (2, $104,000)',
    ]);
  });

  it('[GOVU-8] shows the awardee looked up as a registrant card, and waits while a lookup runs', () => {
    renderWithTheme(<LookedUp />);
    expect(screen.getByRole('heading', { name: 'PRECISION PARTS CO' })).toBeTruthy();
    expect(screen.getByText('looked up')).toBeTruthy();
    // The second awardee is still a click away.
    expect(screen.getAllByRole('button', { name: /Look up awardee/ })).toHaveLength(1);
    renderWithTheme(<LookingUp />);
    expect(
      (screen.getByRole('button', { name: 'Looking up…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('says where the awards come from when none are stored', () => {
    renderWithTheme(<Empty />);
    expect(screen.getByText(/None stored\. Intel › Awards/)).toBeTruthy();
    expect(screen.getByText(/No stored award in this NAICS/)).toBeTruthy();
  });
});
