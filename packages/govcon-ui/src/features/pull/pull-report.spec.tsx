import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makePullReport } from '../../testing/fixtures';
import { summarizePull } from './pull-report';
import * as stories from './pull-report.stories';

const { BudgetStopped, RateLimited } = composeStories(stories);

describe('PullReport', () => {
  it('[GOVU-1] rows every slice with its outcome, what it stored and why it stopped, then the budget line', () => {
    renderWithTheme(<BudgetStopped />);
    const table = within(screen.getByRole('table', { name: 'Pull report' }));
    const rows = table.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[1]?.textContent)).toEqual([
      'naics=332710',
      'naics=333249',
      'naics=541511',
      'naics=541512',
    ]);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      'ok',
      'cached',
      'budget-exhausted',
      'skipped',
    ]);
    expect(within(rows[2] as HTMLElement).getByText('budget 3/3 spent')).toBeTruthy();
    expect(
      screen.getByText(
        '3 of 3 attempts used in the last 24 h · 2 stored · 1 cached · 2 not pulled (stopped: budget)',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Pull · enfav · posted 2026-09-24 to 2026-09-26' }),
    ).toBeTruthy();
  });

  it('[GOVU-1] names a rate limit as the stop and an unreadable ledger as an unknown spend', () => {
    renderWithTheme(<RateLimited />);
    expect(screen.getByText(/stopped: rate-limited/)).toBeTruthy();
    expect(summarizePull(makePullReport({ spent: null }))).toMatch(/^\? of 3 attempts/);
  });
});
