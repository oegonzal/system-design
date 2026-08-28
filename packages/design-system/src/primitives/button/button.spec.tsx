import { composeStories } from '@storybook/react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './button.stories';

/**
 * The stories are the fixtures. Composing them here means a state shown in
 * the catalog is the same state under test — there is no second definition to
 * drift.
 */
const { Solid, Subtle, Selected, Unselected, DisabledSolid } = composeStories(stories);

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Button', () => {
  it('defaults type to button so it cannot submit a form by accident', () => {
    renderWithTheme(<Subtle />);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('sets aria-pressed only when selected is supplied', () => {
    const { unmount } = renderWithTheme(<Selected />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
    unmount();

    renderWithTheme(<Unselected />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');
  });

  it('omits aria-pressed for a button that acts rather than toggles', () => {
    renderWithTheme(<Solid />);
    expect(screen.getByRole('button').hasAttribute('aria-pressed')).toBe(false);
  });

  it('keeps style-only props off the DOM', () => {
    renderWithTheme(<Solid />);
    const button = screen.getByRole('button');

    // The $ convention is internal: consumers pass `variant`/`size`, and
    // neither those nor their transient forms may reach the element.
    for (const attr of ['variant', 'size', 'selected', '$variant', '$size', '$selected']) {
      expect(button.hasAttribute(attr)).toBe(false);
    }
  });

  it('fires onClick, and does not when disabled', () => {
    // A fresh mock per assertion: `fn()` on the meta is one instance shared
    // by every composed story, so reusing it would carry call counts between
    // tests.
    const onClick = fn();
    const { unmount } = renderWithTheme(<Solid onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();

    const onDisabledClick = fn();
    renderWithTheme(<DisabledSolid onClick={onDisabledClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onDisabledClick).not.toHaveBeenCalled();
  });
});
