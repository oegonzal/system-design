import { composeStories } from '@storybook/react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Disclosure, DisclosureButton, DisclosurePanel } from './disclosure';
import * as stories from './disclosure.stories';

const { Folded, Opened, LabelledByState, Controlled } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Disclosure', () => {
  it('starts folded: the button says so, names the panel it controls, and the panel is hidden but kept', () => {
    renderWithTheme(<Folded />);
    const button = screen.getByRole('button', { name: 'Technical details' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(panel?.hidden).toBe(true);
    expect(panel?.textContent).toBe('connect ECONNREFUSED 127.0.0.1:3003');
    expect(panel?.getAttribute('aria-labelledby')).toBe(button.id);
    expect(getComputedStyle(panel as HTMLElement).display).toBe('none');
  });

  it('opens and folds again on the button, from the keyboard as from a pointer', () => {
    renderWithTheme(<Folded />);
    const button = screen.getByRole('button', { name: 'Technical details' });
    const panel = () => document.getElementById(button.getAttribute('aria-controls') ?? '');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel()?.hidden).toBe(false);

    // A button: Enter and Space are its own, so a keyboard opens it as a click does.
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel()?.hidden).toBe(true);
  });

  it('shows its state on screen as well: a chevron that turns toward the panel while it shows, whatever the label says', () => {
    renderWithTheme(<Folded />);
    const button = screen.getByRole('button', { name: 'Technical details' });
    const chevron = () => button.querySelector('[data-disclosure-chevron]') as SVGElement;
    // Decorative: the button is still named by its words alone.
    expect(chevron().getAttribute('aria-hidden')).toBe('true');
    expect(getComputedStyle(chevron()).transform).toBe('rotate(0deg)');

    fireEvent.click(button);
    expect(getComputedStyle(chevron()).transform).toBe('rotate(90deg)');
    fireEvent.click(button);
    expect(getComputedStyle(chevron()).transform).toBe('rotate(0deg)');
  });

  it('can start open, and tells its button what it says while open', () => {
    const opened = renderWithTheme(<Opened />);
    expect(
      screen.getByRole('button', { name: 'Technical details' }).getAttribute('aria-expanded'),
    ).toBe('true');
    opened.unmount();

    renderWithTheme(<LabelledByState />);
    const button = screen.getByRole('button', { name: 'Show lessons' });
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(panel?.tagName).toBe('UL');
    fireEvent.click(button);
    expect(button.textContent).toBe('Hide lessons');
    expect(panel?.hidden).toBe(false);
  });

  it('is the owner’s state when controlled: a toggle asks, and only the owner opens it', () => {
    const onOpenChange = vi.fn();
    const { rerender } = renderWithTheme(
      <Disclosure open={false} onOpenChange={onOpenChange}>
        <DisclosureButton>More</DisclosureButton>
        <DisclosurePanel>the rest</DisclosurePanel>
      </Disclosure>,
    );
    const button = screen.getByRole('button', { name: 'More' });
    fireEvent.click(button);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    rerender(
      <Disclosure open onOpenChange={onOpenChange}>
        <DisclosureButton>More</DisclosureButton>
        <DisclosurePanel>the rest</DisclosurePanel>
      </Disclosure>,
    );
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('the rest').hidden).toBe(false);
  });

  it('lets a controlled owner read the state beside the button', () => {
    renderWithTheme(<Controlled />);
    expect(screen.getByText('The details are folded away.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('The details are shown.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the caller’s own click handler, and leaves the panel alone when it cancels the click', () => {
    const onClick = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    renderWithTheme(
      <Disclosure>
        <DisclosureButton onClick={onClick}>More</DisclosureButton>
        <DisclosurePanel>the rest</DisclosurePanel>
      </Disclosure>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'More' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('refuses a button or panel outside a disclosure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderWithTheme(<DisclosureButton>More</DisclosureButton>)).toThrow(
      'DisclosureButton must be rendered inside <Disclosure>',
    );
    expect(() => renderWithTheme(<DisclosurePanel>the rest</DisclosurePanel>)).toThrow(
      'DisclosurePanel must be rendered inside <Disclosure>',
    );
  });
});
