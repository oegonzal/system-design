import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { PreformattedText } from './preformatted-text';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('PreformattedText', () => {
  it('renders the text verbatim in a labelled pre block under a heading', () => {
    renderWithTheme(<PreformattedText label="Prompt" text={'# Title\n\n- [node.1] keep me'} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Prompt' })).toBeTruthy();
    const block = screen.getByLabelText('Prompt');
    expect(block.tagName).toBe('PRE');
    // No renderer: markdown syntax and bracketed ids survive untouched.
    expect(block.textContent).toBe('# Title\n\n- [node.1] keep me');
  });

  it('passes container attributes through', () => {
    renderWithTheme(<PreformattedText label="Prompt" text="x" data-testid="prompt-markdown" />);
    expect(screen.getByTestId('prompt-markdown')).toBeTruthy();
  });
});
