import { composeStories } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './text-field.stories';

const { Default, ExplicitId, Disabled, Numeric } = composeStories(stories);
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
    expect(input.closest('label')?.getAttribute('for')).toBe('service-name');
  });

  it('passes native attributes through to the control', () => {
    renderWithTheme(<Disabled />);
    expect((screen.getByLabelText('Service name') as HTMLInputElement).disabled).toBe(true);
  });

  it('is any input type the caller asks for', () => {
    renderWithTheme(<Numeric />);
    const input = screen.getByLabelText('Iterations') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.max).toBe('10');
  });
});
