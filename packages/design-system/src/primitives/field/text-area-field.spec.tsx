import { composeStories } from '@storybook/react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './text-area-field.stories';

const { Default, Tall, Disabled, Invalid, NearLimit } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

/** A limited field's own polite region, and what it last said. */
const announcer = () => document.querySelector('[aria-live="polite"]');
const announced = () => announcer()?.textContent;

describe('TextAreaField', () => {
  it('renders a labelled textarea with four rows by default', () => {
    renderWithTheme(<Default />);
    const area = screen.getByLabelText('Design narrative') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.rows).toBe(4);
  });

  it('takes the rows and value it is given', () => {
    renderWithTheme(<Tall />);
    const area = screen.getByLabelText('Design narrative') as HTMLTextAreaElement;
    expect(area.rows).toBe(8);
    expect(area.value).toContain('gateway');
  });

  it('passes disabled through', () => {
    renderWithTheme(<Disabled />);
    expect((screen.getByLabelText('Design narrative') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('shows why a value is refused and marks the area invalid', () => {
    renderWithTheme(<Invalid />);
    const area = screen.getByLabelText('Design narrative');
    expect(area.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(area.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Say how a request travels.',
    );
  });

  it('counts what is left of a maxLength as it nears, and says when it is reached', () => {
    renderWithTheme(<NearLimit />);
    const area = screen.getByLabelText('Design narrative');
    const count = () => document.getElementById(area.getAttribute('aria-describedby') ?? '');
    expect(count()?.textContent).toBe('4 characters left');
    expect(announced()).toBe('Nearing the limit of 60 characters.');

    fireEvent.change(area, { target: { value: 'x'.repeat(60) } });
    expect(count()?.textContent).toBe('Limit reached — 60 characters at most.');
    expect(announced()).toBe('Limit of 60 characters reached.');
  });

  it('says nothing of a maxLength while there is room', () => {
    renderWithTheme(<Default maxLength={60} defaultValue="Requests enter through the gateway." />);
    expect(screen.getByLabelText('Design narrative').hasAttribute('aria-describedby')).toBe(false);
  });
});
