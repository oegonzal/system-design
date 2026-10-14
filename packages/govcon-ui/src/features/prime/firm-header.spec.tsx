import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './firm-header.stories';

const { Named, Unnamed, HoldsNothing } = composeStories(stories);

describe('FirmHeader', () => {
  it('[GOVU-19] heads the page with the firm’s name over its UEI and what it holds in the codes read, with its UEI alone until something names it, and says when it holds nothing', () => {
    const named = renderWithTheme(<Named />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('BOOZ ALLEN HAMILTON INC');
    expect(
      screen.getByText(
        'UEI JCBMLGPE6Z71 · $2.5B obligated to it in these codes, 2025-06-15 to 2026-06-15',
      ),
    ).toBeTruthy();
    named.unmount();

    const unnamed = renderWithTheme(<Unnamed />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Firm JCBMLGPE6Z71');
    expect(screen.queryByText(/^UEI /)).toBeNull();
    unnamed.unmount();

    renderWithTheme(<HoldsNothing />);
    expect(
      screen.getByText(
        'UEI JCBMLGPE6Z71 · Nothing obligated to it in these codes, 2025-06-15 to 2026-06-15',
      ),
    ).toBeTruthy();
  });
});
