import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import * as stories from './pager.stories';

const { Middle, First, Last, Empty } = composeStories(stories);

describe('Pager', () => {
  it('[GOVU-6] says which rows are shown and moves one page at a time', () => {
    const onChange = fn();
    renderWithTheme(<Middle onChange={onChange} />);
    expect(screen.getByText('26–50 of 62')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onChange).toHaveBeenLastCalledWith(50);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('disables the edge it cannot move past', () => {
    renderWithTheme(<First />);
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    renderWithTheme(<Last />);
    expect(screen.getByText('51–62 of 62')).toBeTruthy();
    expect(
      (screen.getAllByRole('button', { name: 'Next' }).at(-1) as HTMLButtonElement).disabled,
    ).toBe(true);
    renderWithTheme(<Empty />);
    expect(screen.getByText('0–0 of 0')).toBeTruthy();
  });
});
