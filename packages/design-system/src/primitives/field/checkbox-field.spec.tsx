import { composeStories } from '@storybook/react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './checkbox-field.stories';

const { Unchecked, Checked, Disabled } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('CheckboxField', () => {
  it('is a checkbox reachable by its label and toggles on click', () => {
    renderWithTheme(<Unchecked />);
    const box = screen.getByLabelText('Carries personal data') as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
    fireEvent.click(screen.getByText('Carries personal data'));
    expect(box.checked).toBe(true);
  });

  it('starts checked when told to', () => {
    renderWithTheme(<Checked />);
    expect((screen.getByLabelText('Carries personal data') as HTMLInputElement).checked).toBe(true);
  });

  it('passes disabled through', () => {
    renderWithTheme(<Disabled />);
    expect((screen.getByLabelText('Carries personal data') as HTMLInputElement).disabled).toBe(
      true,
    );
  });
});
