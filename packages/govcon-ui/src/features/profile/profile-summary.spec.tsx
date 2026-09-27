import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './profile-summary.stories';

const { Default } = composeStories(stories);

describe('ProfileSummary', () => {
  it('[GOVU-1] shows the codes, interests, weights, set-aside prices, tiers and slices as data', () => {
    renderWithTheme(<Default />);
    expect(screen.getByRole('heading', { name: 'Profile · Enfav LLC (enfav)' })).toBeTruthy();
    expect(screen.getByText('332710')).toBeTruthy();
    expect(screen.getByText('DA')).toBeTruthy();
    expect(screen.getByText(/additive manufacturing \(60%\)/)).toBeTruthy();
    expect(screen.getByText(/naics 30% · psc 15% · interests 15%/)).toBeTruthy();
    expect(
      screen.getByText(/SBA 100% · SBP 80% · open competition 50% · any other code is excluded/),
    ).toBeTruthy();
    expect(screen.getByText(/high at 70\+, medium at 45\+/)).toBeTruthy();
    expect(screen.getByText(/4 slice\(s\) — naics=332710, naics=333249/)).toBeTruthy();
  });
});
