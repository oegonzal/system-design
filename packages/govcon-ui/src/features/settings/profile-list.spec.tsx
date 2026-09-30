import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as stories from './profile-list.stories';

const { Default, Single } = composeStories(stories);

describe('ProfileList', () => {
  it('[GOVU-10] rows every profile with the default marked, and wires new, copy, default and delete', () => {
    const handlers = {
      onSelect: vi.fn(),
      onNew: vi.fn(),
      onCopy: vi.fn(),
      onSetDefault: vi.fn(),
      onDelete: vi.fn(),
    };
    renderWithTheme(<Default {...handlers} />);
    const rows = within(screen.getByRole('table', { name: 'Profiles' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText('default')).toBeTruthy();
    expect(rows[0]?.getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'New profile' }));
    expect(handlers.onNew).toHaveBeenCalled();
    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'other' }));
    expect(handlers.onSelect).toHaveBeenCalledWith('other');
    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Copy' }));
    expect(handlers.onCopy).toHaveBeenCalledWith('other');
    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Set default' }));
    expect(handlers.onSetDefault).toHaveBeenCalledWith('other');
    expect(
      (
        within(rows[0] as HTMLElement).getByRole('button', {
          name: 'Set default',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Delete' }));
    expect(handlers.onDelete).toHaveBeenCalledWith('other');
  });

  it('will not offer to delete the last profile', () => {
    renderWithTheme(<Single />);
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/The last profile cannot be removed/)).toBeTruthy();
  });
});
