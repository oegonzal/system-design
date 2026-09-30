import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import * as stories from './description-panel.stories';

const { Default, Stored, Fetching, BudgetSpent } = composeStories(stories);

describe('DescriptionPanel', () => {
  it('[GOVU-3] offers to fetch the description, states the cost, and reports the click', () => {
    const onFetch = fn();
    renderWithTheme(<Default onFetch={onFetch} />);
    expect(screen.getByText(/Fetching spends one request/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch description (1 request)' }));
    expect(onFetch).toHaveBeenCalledTimes(1);
  });

  it('[GOVU-3] shows the fetched text with its date, and no button', () => {
    renderWithTheme(<Stored />);
    expect(screen.getByText(/Fetched 2026-09-27 — stored/)).toBeTruthy();
    expect(screen.getByLabelText('Description').textContent).toContain('Delivery: 90 days ARO');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('[GOVU-3] waits while fetching and names the problem as an alert when the budget refused', () => {
    renderWithTheme(<Fetching />);
    expect((screen.getByRole('button', { name: 'Fetching…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    renderWithTheme(<BudgetSpent />);
    expect(screen.getByRole('alert').textContent).toContain('The budget is spent: 10 of 10');
  });
});
