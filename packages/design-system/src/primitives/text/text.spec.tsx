import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Text } from './text';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Text', () => {
  it('renders a paragraph by default', () => {
    renderWithTheme(<Text>body copy</Text>);
    expect(screen.getByText('body copy').tagName).toBe('P');
  });

  it('renders a span when asked, for inline use', () => {
    renderWithTheme(<Text as="span">inline</Text>);
    expect(screen.getByText('inline').tagName).toBe('SPAN');
  });

  it('accepts every tone and size combination', () => {
    renderWithTheme(
      <>
        <Text tone="secondary" size="lg">
          secondary
        </Text>
        <Text tone="muted" size="sm">
          muted
        </Text>
      </>,
    );
    expect(screen.getByText('secondary')).toBeTruthy();
    expect(screen.getByText('muted')).toBeTruthy();
  });

  it('wraps a run with no break in it inside its block, by the rule that leaves the block’s smallest width alone', () => {
    renderWithTheme(<Text>CONT_AWD_HQ003424F0250_9700_47QTCB22D0289_4732</Text>);
    expect(
      getComputedStyle(screen.getByText('CONT_AWD_HQ003424F0250_9700_47QTCB22D0289_4732'))
        .overflowWrap,
    ).toBe('break-word');
  });

  it('keeps style-only props off the DOM', () => {
    renderWithTheme(
      <Text tone="muted" size="sm">
        caption
      </Text>,
    );
    const text = screen.getByText('caption');
    for (const attr of ['tone', 'size', 'as', '$tone', '$size']) {
      expect(text.hasAttribute(attr)).toBe(false);
    }
  });
});
