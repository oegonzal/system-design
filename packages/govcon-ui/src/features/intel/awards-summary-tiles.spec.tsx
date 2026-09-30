import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as stories from './awards-summary-tiles.stories';

const { Default, Empty, LookingUp } = composeStories(stories);

describe('AwardsSummaryTiles', () => {
  it('[GOVU-9] tiles the count, total, median, offers bands, set-aside mix and sources, and offers a lookup per awardee UEI', () => {
    const onLookup = vi.fn();
    renderWithTheme(<Default onLookup={onLookup} />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('$156,000')).toBeTruthy();
    expect(screen.getByText('$52,000')).toBeTruthy();
    expect(screen.getByText(/one 1 · few 2 · many 0 · unknown 0/)).toBeTruthy();
    expect(screen.getByText(/SBA 2 · open 1/)).toBeTruthy();
    expect(screen.getByText(/sam\.gov 3 · USAspending 0/)).toBeTruthy();
    expect(
      screen.getByText(/PRECISION PARTS CO · 2 award\(s\) · \$104,000 · ABC123DEF456/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Look up (1 request)' }));
    expect(onLookup).toHaveBeenCalledWith('ABC123DEF456');
  });

  it('says when nothing is stored, and shows the lookup in flight', () => {
    renderWithTheme(<Empty />);
    expect(screen.getByText(/No awardee yet/)).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    renderWithTheme(<LookingUp />);
    expect(
      (screen.getByRole('button', { name: 'Looking up…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
