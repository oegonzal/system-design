import { composeStories } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './text-area-field.stories';

const { Default, Tall, Disabled, Invalid } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

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
});
