import { composeStories } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './text-field.stories';

const { Default, ExplicitId, Disabled, Numeric, Invalid } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('TextField', () => {
  it('associates the label with the input', () => {
    renderWithTheme(<Default />);
    expect(screen.getByLabelText('Service name').tagName).toBe('INPUT');
  });

  it('honours an explicit id and points the label at it', () => {
    renderWithTheme(<ExplicitId />);
    const input = screen.getByLabelText('Service name');
    expect(input.id).toBe('service-name');
    expect(document.querySelector('label[for="service-name"]')?.textContent).toBe('Service name');
  });

  it('passes native attributes through to the control', () => {
    renderWithTheme(<Disabled />);
    expect((screen.getByLabelText('Service name') as HTMLInputElement).disabled).toBe(true);
  });

  it('marks a refused value invalid and describes it by the reason shown under it, and nothing while valid', () => {
    renderWithTheme(<Invalid />);
    const input = screen.getByLabelText('Service name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const reason = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('A service needs a name.');

    const { container } = renderWithTheme(<Default label="Owner" aria-describedby="hint" />);
    const valid = container.querySelector('input');
    expect(valid?.hasAttribute('aria-invalid')).toBe(false);
    expect(valid?.getAttribute('aria-describedby')).toBe('hint');
  });

  it('keeps the caller’s own description alongside the reason', () => {
    renderWithTheme(<Invalid aria-describedby="hint" />);
    const describedBy = screen.getByLabelText('Service name').getAttribute('aria-describedby');
    expect(describedBy?.split(' ')[0]).toBe('hint');
    expect(describedBy?.split(' ')).toHaveLength(2);
  });

  it('is any input type the caller asks for', () => {
    renderWithTheme(<Numeric />);
    const input = screen.getByLabelText('Iterations') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.max).toBe('10');
  });
});
