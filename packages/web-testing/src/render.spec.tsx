import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installDomShims } from './dom-shims';
import { renderWithTheme } from './render';

installDomShims();

describe('renderWithTheme', () => {
  it('[WEB-2] mounts the tree under the theme, honouring an appearance override', () => {
    renderWithTheme(<button type="button">hello</button>, { settings: { colorMode: 'dark' } });

    expect(screen.getByRole('button', { name: 'hello' })).toBeTruthy();
    expect(document.documentElement.dataset['colorMode']).toBe('dark');
  });
});
