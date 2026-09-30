import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './score-trace.stories';

const { Default, Excluded } = composeStories(stories);

describe('ScoreTrace', () => {
  it('[GOVU-2] [GOVU-8] shows the score as a meter and every factor with its value, weight, points and evidence, the points summing to the score', () => {
    renderWithTheme(<Default />);
    expect(
      screen.getByRole('meter', { name: 'Score 71.5 · high' }).getAttribute('aria-valuenow'),
    ).toBe('72');
    const trace = within(screen.getByRole('table', { name: 'Factor trace' }));
    const rows = trace.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      'naics',
      'psc',
      'interests',
      'setAside',
      'noticeType',
      'deadline',
    ]);
    expect(
      rows
        .map((row) => Number(within(row).getAllByRole('cell')[3]?.textContent))
        .reduce((a, b) => a + b, 0),
    ).toBeCloseTo(71.5, 6);
    expect(within(rows[1] as HTMLElement).getByText('psc 5975 in family 59')).toBeTruthy();
  });

  it('shows why a gate excluded a notice instead of a score', () => {
    renderWithTheme(<Excluded />);
    expect(screen.getByText('Excluded by setAside: ineligible set-aside HZC')).toBeTruthy();
    expect(screen.queryByRole('meter')).toBeNull();
  });
});
