import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import * as stories from './lead-detail.stories';

const { Default, WithDescription, Fetching, BudgetSpent, Excluded } = composeStories(stories);

describe('LeadDetail', () => {
  it('[GOVU-2] shows the facts, the score as a meter and every factor with its evidence', () => {
    renderWithTheme(<Default />);
    expect(
      screen.getByRole('heading', { name: '59--JUNCTION BOX, IN REPAIR/MODIFICATION OF' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Solicitation · posted 2026-09-25 · deadline 2026-10-26 · active/),
    ).toBeTruthy();
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
    expect(screen.getByRole('link', { name: 'open on sam.gov' }).getAttribute('rel')).toBe(
      'noreferrer',
    );
    expect(
      screen.getByText(/Contact: Noelle Smith · noelle.smith@navy.example · 717-605-3992/),
    ).toBeTruthy();
  });

  it('[GOVU-3] offers to fetch the description and reports the click', () => {
    const onFetchDescription = fn();
    renderWithTheme(<Default onFetchDescription={onFetchDescription} />);
    expect(screen.getByText(/Fetching spends one request/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch description' }));
    expect(onFetchDescription).toHaveBeenCalledTimes(1);
  });

  it('[GOVU-3] shows the fetched text with its date, and no button', () => {
    renderWithTheme(<WithDescription />);
    expect(screen.getByText(/Fetched 2026-09-27 — stored/)).toBeTruthy();
    expect(screen.getByLabelText('Description text').textContent).toContain(
      'Delivery: 90 days ARO',
    );
    expect(screen.queryByRole('button', { name: /Fetch description/ })).toBeNull();
  });

  it('[GOVU-3] waits while fetching and names the problem when the budget refused', () => {
    renderWithTheme(<Fetching />);
    expect((screen.getByRole('button', { name: 'Fetching…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    renderWithTheme(<BudgetSpent />);
    expect(screen.getByText(/The budget is spent: 10 of 10/)).toBeTruthy();
  });

  it('shows why a gate excluded a notice instead of a score', () => {
    renderWithTheme(<Excluded />);
    expect(screen.getByText('Excluded by setAside: ineligible set-aside HZC')).toBeTruthy();
    expect(screen.queryByRole('meter')).toBeNull();
  });
});
