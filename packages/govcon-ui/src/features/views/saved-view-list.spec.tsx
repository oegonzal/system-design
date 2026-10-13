import { savedViewOf } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as stories from './saved-view-list.stories';

const { Default, OnASavedView, Empty, Busy, Refused } = composeStories(stories);

describe('SavedViewList', () => {
  it('[GOVU-16] lists each kept view as a link to its address, marks the one that is this page, and removes one by its own button', () => {
    const onRemove = vi.fn();
    const first = renderWithTheme(<Default onRemove={onRemove} />);
    const list = screen.getByRole('list', { name: 'Saved views' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Who buys', '/spending?naics=541511&tab=where'],
      [
        'Open to us, by winner',
        '/spending?naics=541511&tab=where&category=recipient&placement=standalone&newOnly=true',
      ],
    ]);
    expect(links.every((link) => link.getAttribute('aria-current') === null)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove the saved view Who buys' }));
    expect(onRemove).toHaveBeenCalledWith('v-1');
    first.unmount();

    renderWithTheme(<OnASavedView />);
    expect(screen.getByRole('link', { name: 'Who buys' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('[GOVU-16] keeps the page under a typed name, says update for a name already kept, clears the field once the list holds what was saved, and saves nothing unnamed', () => {
    const onSave = vi.fn();
    const { rerender } = renderWithTheme(<Default onSave={onSave} />);
    const field = screen.getByLabelText('Save this view as') as HTMLInputElement;
    const button = () => screen.getByRole('button', { name: /^(Save|Update) view$/ });
    expect((button() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(field, { target: { value: '  Pulse, programming ' } });
    expect(button().textContent).toBe('Save view');
    fireEvent.click(button());
    expect(onSave).toHaveBeenCalledWith('Pulse, programming');
    // Not kept yet: what was typed stays until the list answers.
    expect(field.value).toBe('  Pulse, programming ');
    rerender(
      <Default
        onSave={onSave}
        views={[
          ...(Default.args.views ?? []),
          savedViewOf({
            id: 'v-3',
            name: 'Pulse, programming',
            href: '/spending?naics=541511&tab=pulse',
          }),
        ]}
      />,
    );
    expect(field.value).toBe('');

    fireEvent.change(field, { target: { value: 'Who buys' } });
    expect(button().textContent).toBe('Update view');
  });

  it('says when nothing is kept, waits while a write is in flight, and shows why one was refused', () => {
    const empty = renderWithTheme(<Empty />);
    expect(screen.getByText(/No saved views yet/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Saved views' })).toBeNull();
    empty.unmount();

    const busy = renderWithTheme(<Busy />);
    expect(
      (screen.getByRole('button', { name: /Remove the saved view Who buys/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect((screen.getByLabelText('Save this view as') as HTMLInputElement).disabled).toBe(true);
    busy.unmount();

    renderWithTheme(<Refused />);
    expect(screen.getByRole('alert').textContent).toBe('href: an address inside the client');
  });
});
