import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './source-status.stories';
import { budgetTone } from './source-status';

const { Default, NearlySpent, Disabled, LedgerUnreadable } = composeStories(stories);

describe('SourceStatus', () => {
  it('[GOVU-1] shows every source, whether it can be called, and each bucket as a meter over the rolling day', () => {
    renderWithTheme(<Default />);
    expect(screen.getByText('sam.gov enabled')).toBeTruthy();
    expect(screen.getByText('usaspending enabled · free')).toBeTruthy();
    const meter = screen.getByRole('meter', {
      name: 'sam.gov: 3 of 10 requests used in the last 24 h',
    });
    expect(meter.getAttribute('aria-valuenow')).toBe('30');
    expect(screen.getByText(/pulled inside the last 24 h is not pulled again/)).toBeTruthy();
  });

  it('[GOVU-1] names the reason when the source is disabled', () => {
    renderWithTheme(<Disabled />);
    expect(screen.getByText('sam.gov disabled (no-key)')).toBeTruthy();
  });

  it('[GOVU-1] says when the budget is unknown instead of drawing a meter', () => {
    renderWithTheme(<LedgerUnreadable />);
    expect(screen.getByText(/budget unknown/)).toBeTruthy();
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('turns the tone as the budget runs out — usage is the bad end of this scale', () => {
    expect(budgetTone(3, 10)).toBe('success');
    expect(budgetTone(6, 10)).toBe('warn');
    expect(budgetTone(9, 10)).toBe('danger');
    expect(budgetTone(0, 0)).toBe('danger');
    renderWithTheme(<NearlySpent />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('90');
  });
});
