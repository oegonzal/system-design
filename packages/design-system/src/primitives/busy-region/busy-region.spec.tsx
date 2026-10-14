import { composeStories } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './busy-region.stories';

const { Settled, Busy } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });
/** The region's own decoration: the one hidden child it puts before what it wraps. */
const barIn = (region: HTMLElement) => region.querySelector(':scope > [aria-hidden="true"]');

describe('BusyRegion', () => {
  it('shows a settled answer as it is, and the last answer under a bar and marked busy while the next loads — never dimmed, so it stays readable for as long as someone waits on it', () => {
    const settled = renderWithTheme(<Settled data-testid="panel" />);
    const still = screen.getByTestId('panel');
    expect(still.hasAttribute('aria-busy')).toBe(false);
    expect(barIn(still)).toBeNull();
    expect(screen.getByText('$67.5B')).toBeTruthy();
    settled.unmount();

    renderWithTheme(<Busy data-testid="panel" />);
    const busy = screen.getByTestId('panel');
    expect(busy.getAttribute('aria-busy')).toBe('true');
    // The bar is decoration: the busy state reaches assistive technology through the region.
    expect(barIn(busy)).not.toBeNull();
    expect(getComputedStyle(busy).opacity || '1').toBe('1');
    // Nothing is unmounted: the last answer is still there to read.
    expect(screen.getByText('$67.5B')).toBeTruthy();
  });
});
