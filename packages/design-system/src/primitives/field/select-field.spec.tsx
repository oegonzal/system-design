import { composeStories } from '@storybook/react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import * as stories from './select-field.stories';

const { Default, Preselected, Disabled } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('SelectField', () => {
  it('renders the caller’s options under the label', () => {
    renderWithTheme(<Default />);
    const select = screen.getByLabelText('Pipeline') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect([...select.options].map((option) => option.value)).toEqual([
      'system-design',
      'code-review',
    ]);
  });

  it('starts on the preselected value and changes on input', () => {
    renderWithTheme(<Preselected />);
    const select = screen.getByLabelText('Pipeline') as HTMLSelectElement;
    expect(select.value).toBe('code-review');
    fireEvent.change(select, { target: { value: 'system-design' } });
    expect(select.value).toBe('system-design');
  });

  it('passes disabled through', () => {
    renderWithTheme(<Disabled />);
    expect((screen.getByLabelText('Pipeline') as HTMLSelectElement).disabled).toBe(true);
  });
});
