import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './call-history.stories';

const { Default, WithFailures, Empty } = composeStories(stories);

describe('CallHistory', () => {
  it('[GOVU-4] rows every call newest first with its operation, what it asked, its outcome and size', () => {
    renderWithTheme(<Default />);
    expect(screen.getByText('3 of 3 in the ledger, newest first')).toBeTruthy();
    const rows = within(screen.getByRole('table', { name: 'Source calls' }))
      .getAllByRole('row')
      .slice(1);
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
    expect(cells(rows[0] as HTMLElement)).toEqual([
      '2026-09-27 02:57',
      'description',
      'notice 21b78119…',
      'ok',
      '1',
      '640',
      '200',
    ]);
    expect(cells(rows[2] as HTMLElement)).toEqual([
      '2026-09-27 02:10',
      'search',
      'naics=332710',
      'ok',
      '2 of 2',
      '931',
      '200',
    ]);
  });

  it('[GOVU-4] shows a failure with its message, and says when the ledger is empty', () => {
    renderWithTheme(<WithFailures />);
    expect(screen.getByText(/rate limited — OVER_RATE_LIMIT/)).toBeTruthy();
    expect(screen.getByText(/body is not JSON/)).toBeTruthy();
    renderWithTheme(<Empty />);
    expect(screen.getByText(/No calls yet/)).toBeTruthy();
  });
});
