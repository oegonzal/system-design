import { composeStories } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { PENDING_OPACITY } from './busy-region';
import * as stories from './busy-region.stories';

const { Settled, Busy } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('BusyRegion', () => {
  it('shows a settled answer as it is, and the last answer dimmed and marked busy while the next loads', () => {
    const settled = renderWithTheme(<Settled data-testid="panel" />);
    const still = screen.getByTestId('panel');
    expect(still.hasAttribute('aria-busy')).toBe(false);
    expect(getComputedStyle(still).opacity).toBe('1');
    expect(screen.getByText('$67.5B')).toBeTruthy();
    settled.unmount();

    renderWithTheme(<Busy data-testid="panel" />);
    const busy = screen.getByTestId('panel');
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(getComputedStyle(busy).opacity).toBe(String(PENDING_OPACITY));
    // Nothing is unmounted: the last answer is still there to read.
    expect(screen.getByText('$67.5B')).toBeTruthy();
  });
});
