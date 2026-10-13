import { composeStories } from '@storybook/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './chip-group.stories';

const { SingleChoice, CodeSet, Disabled } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('ChipGroup', () => {
  it('is one named group of toggle buttons, each saying whether it is pressed, and hands a press to its owner', () => {
    const onToggle = vi.fn();
    renderWithTheme(<SingleChoice onToggle={onToggle} />);
    const group = screen.getByRole('group', { name: 'Window' });
    const chips = within(group).getAllByRole('button');
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute('aria-pressed')])).toEqual([
      ['Fiscal year to date', 'false'],
      ['Prior fiscal year', 'false'],
      ['Last 12 months', 'true'],
    ]);
    // The name is the group's alone unless asked for in view.
    expect(within(group).queryByText('Window')).toBeNull();
    fireEvent.click(within(group).getByRole('button', { name: 'Prior fiscal year' }));
    expect(onToggle).toHaveBeenCalledWith('prior-fy');
  });

  it('shows its name when asked, presses any number of chips, and says what a code stands for', () => {
    renderWithTheme(<CodeSet />);
    const group = screen.getByRole('group', { name: 'Set-aside' });
    expect(within(group).getByText('Set-aside')).toBeTruthy();
    expect(
      within(group)
        .getAllByRole('button', { pressed: true })
        .map((chip) => chip.textContent),
    ).toEqual(['NONE', 'SBA']);
    expect(within(group).getByRole('button', { name: '8A' }).getAttribute('title')).toBe(
      '8(a), competed',
    );
  });

  it('presses nothing while disabled', () => {
    const onToggle = vi.fn();
    renderWithTheme(<Disabled onToggle={onToggle} />);
    for (const chip of screen.getAllByRole('button')) {
      expect((chip as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(chip);
    }
    expect(onToggle).not.toHaveBeenCalled();
  });
});
