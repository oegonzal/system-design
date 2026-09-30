import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Markdown } from './markdown';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

const DOCUMENT = [
  '# Design an order-history service',
  '',
  '## Functional requirements',
  '1. A shopper reads their merged order history.',
  '',
  '### Detail',
  '',
  '#### Finer detail',
  '',
  '| Metric | Target |',
  '| --- | --- |',
  '| Peak reads | 2,000 rps |',
  '',
  'See the [storefront docs](https://example.com/docs) and ~~the old spec~~.',
].join('\n');

describe('Markdown', () => {
  it('renders the document under a labelled block, its headings demoted below the label', () => {
    renderWithTheme(<Markdown label="Prompt" text={DOCUMENT} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Prompt' })).toBeTruthy();
    const block = screen.getByLabelText('Prompt');
    expect(
      within(block).getByRole('heading', { level: 3, name: 'Design an order-history service' }),
    ).toBeTruthy();
    expect(
      within(block).getByRole('heading', { level: 4, name: 'Functional requirements' }),
    ).toBeTruthy();
    expect(within(block).getByRole('heading', { level: 5, name: 'Detail' })).toBeTruthy();
    expect(within(block).getByRole('heading', { level: 6, name: 'Finer detail' })).toBeTruthy();
    expect(within(block).queryByRole('heading', { level: 1 })).toBeNull();
    expect(within(block).queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('renders GitHub flavour: a table, an ordered list, strikethrough', () => {
    renderWithTheme(<Markdown label="Prompt" text={DOCUMENT} />);

    const block = screen.getByLabelText('Prompt');
    const table = within(block).getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Metric' })).toBeTruthy();
    expect(within(table).getByRole('cell', { name: '2,000 rps' })).toBeTruthy();
    expect(within(block).getByRole('list').tagName).toBe('OL');
    expect(block.querySelector('del')?.textContent).toBe('the old spec');
  });

  it('renders a link as the design-system anchor that never leaks the referrer', () => {
    renderWithTheme(<Markdown label="Prompt" text={DOCUMENT} />);

    const link = screen.getByRole('link', { name: 'storefront docs' });
    expect(link.getAttribute('href')).toBe('https://example.com/docs');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('drops raw HTML and unsafe URL schemes instead of rendering them', () => {
    renderWithTheme(
      <Markdown
        label="Prompt"
        text={
          'Before <script>window.pwned = true</script><b>bold</b> after\n\n[run](javascript:alert(1))'
        }
      />,
    );

    const block = screen.getByLabelText('Prompt');
    // The tags are gone; what was between them is inert text, never an element.
    expect(block.querySelector('script')).toBeNull();
    expect(block.querySelector('b')).toBeNull();
    expect(block.textContent).toContain('Before window.pwned = truebold after');
    // A javascript: URL is stripped, leaving an anchor that goes nowhere.
    const disarmed = screen.getByText('run');
    expect(disarmed.tagName).toBe('A');
    expect(disarmed.getAttribute('href')).toBe('');
  });

  it('passes container attributes through', () => {
    renderWithTheme(<Markdown label="Prompt" text="x" data-testid="prompt-markdown" />);
    expect(screen.getByTestId('prompt-markdown')).toBeTruthy();
  });
});
