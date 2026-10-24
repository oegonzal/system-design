import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './entity-card.stories';

const { Default, Excluded } = composeStories(stories);

describe('EntityCard', () => {
  it('[GOVU-8] shows the registration, its expiry, the NAICS with small-business sizing, the certifications, and the website as a link', () => {
    renderWithTheme(<Default />);
    expect(screen.getByRole('heading', { name: 'PRECISION PARTS CO' })).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(
      screen.getByText(/UEI ABC123DEF456 · CAGE 1AB23 · registration expires 2027-03-01/),
    ).toBeTruthy();
    expect(screen.getByText('332710 small')).toBeTruthy();
    expect(screen.getByText(/SBA certifications none · PSC 5340/)).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'https://www.precision-parts.example' })
        .getAttribute('href'),
    ).toBe('https://www.precision-parts.example');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('[GOVU-8] leads with the exclusion when there is one', () => {
    renderWithTheme(<Excluded />);
    expect(screen.getByRole('alert').textContent).toContain('Excluded');
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText(/SBA certifications A6/)).toBeTruthy();
    // No website registered: no link, and no empty label.
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/Website/)).toBeNull();
  });
});
