import { NO_FACETS } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as stories from './facet-controls.stories';

const { Unset, Narrowed, Unlisted, WithPreset, PresetApplied } = composeStories(stories);

describe('FacetControls', () => {
  it('[GOVU-14] gives each declared facet the control its kind calls for, hands a select, a size band and a flag on at once, and a set-aside chip as one press of a run', () => {
    const onCommit = vi.fn();
    const onSettle = vi.fn();
    renderWithTheme(<Unset onCommit={onCommit} onSettle={onSettle} />);

    fireEvent.change(screen.getByLabelText('Won by'), { target: { value: 'small' } });
    expect(onCommit).toHaveBeenLastCalledWith({ ...NO_FACETS, recipientSize: 'small' });
    fireEvent.change(screen.getByLabelText('Placed as'), { target: { value: 'standalone' } });
    expect(onCommit).toHaveBeenLastCalledWith({ ...NO_FACETS, placement: 'standalone' });

    const lanes = screen.getByRole('group', { name: 'Set-aside' });
    expect(within(lanes).getByRole('button', { name: 'SBA' }).getAttribute('title')).toBe(
      'Small business',
    );
    fireEvent.click(within(lanes).getByRole('button', { name: 'SBA' }));
    expect(onSettle).toHaveBeenLastCalledWith({ ...NO_FACETS, setAside: ['SBA'] });
    expect(onCommit).toHaveBeenCalledTimes(2);

    const sizes = screen.getByRole('group', { name: 'Award size' });
    fireEvent.click(within(sizes).getByRole('button', { name: '$15K to $350K' }));
    expect(onCommit).toHaveBeenLastCalledWith({
      ...NO_FACETS,
      amount: { min: 15_000.01, max: 350_000 },
    });
    fireEvent.click(screen.getByLabelText('New awards only'));
    expect(onCommit).toHaveBeenLastCalledWith({ ...NO_FACETS, newOnly: true });
  });

  it('[GOVU-14] keeps a firm’s UEI as it is typed — half a code is no code, and is not taken from under the cursor — hands it on in capitals once it is one, and gives way to a value set from outside', () => {
    const onSettle = vi.fn();
    const { rerender } = renderWithTheme(<Unset onSettle={onSettle} />);
    const field = screen.getByLabelText('Awarded to') as HTMLInputElement;
    expect(screen.getByText('UEIs, comma-separated')).toBeTruthy();

    fireEvent.change(field, { target: { value: 'smnwm6' } });
    expect(field.value).toBe('smnwm6');
    expect(onSettle).toHaveBeenLastCalledWith(NO_FACETS);
    fireEvent.change(field, { target: { value: 'smnwm6hn79x5' } });
    expect(onSettle).toHaveBeenLastCalledWith({ ...NO_FACETS, recipient: ['SMNWM6HN79X5'] });

    // The owner now holds what was typed: the field keeps the typing as it stands.
    rerender(<Unset onSettle={onSettle} facets={{ ...NO_FACETS, recipient: ['SMNWM6HN79X5'] }} />);
    expect(field.value).toBe('smnwm6hn79x5');
    // A link followed sets another firm: the field shows it.
    rerender(<Unset onSettle={onSettle} facets={{ ...NO_FACETS, recipient: ['JCBMLGPE6Z71'] }} />);
    expect(field.value).toBe('JCBMLGPE6Z71');
    rerender(<Unset onSettle={onSettle} facets={NO_FACETS} />);
    expect(field.value).toBe('');
  });

  it('[GOVU-14] shows what is set, releases a pressed chip, and unsets a select back to any', () => {
    const onCommit = vi.fn();
    const onSettle = vi.fn();
    const { args } = Narrowed;
    renderWithTheme(<Narrowed onCommit={onCommit} onSettle={onSettle} />);
    expect((screen.getByLabelText('Won by') as HTMLSelectElement).value).toBe('small');
    expect((screen.getByLabelText('New awards only') as HTMLInputElement).checked).toBe(true);
    const lanes = screen.getByRole('group', { name: 'Set-aside' });
    expect(
      within(lanes)
        .getAllByRole('button', { pressed: true })
        .map((chip) => chip.textContent),
    ).toEqual(['NONE', 'SBA']);

    fireEvent.click(within(lanes).getByRole('button', { name: 'NONE' }));
    expect(onSettle).toHaveBeenLastCalledWith({ ...args.facets, setAside: ['SBA'] });
    const sizes = screen.getByRole('group', { name: 'Award size' });
    fireEvent.click(within(sizes).getByRole('button', { name: '$15K to $350K', pressed: true }));
    expect(onCommit).toHaveBeenLastCalledWith({ ...args.facets, amount: null });
    fireEvent.change(screen.getByLabelText('Won by'), { target: { value: '' } });
    expect(onCommit).toHaveBeenLastCalledWith({ ...args.facets, recipientSize: null });
  });

  it('[GOVU-14] shows a code and a range the table does not offer pressed beside the ones it does', () => {
    renderWithTheme(<Unlisted />);
    const lanes = screen.getByRole('group', { name: 'Set-aside' });
    expect(within(lanes).getByRole('button', { name: 'RSB', pressed: true })).toBeTruthy();
    const sizes = screen.getByRole('group', { name: 'Award size' });
    expect(within(sizes).getByRole('button', { name: '$50K to $2M', pressed: true })).toBeTruthy();
    expect(within(sizes).getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  it('[GOVU-14] applies the profile’s lanes in one press, and clears them with the next', () => {
    const onCommit = vi.fn();
    const unset = renderWithTheme(<WithPreset onCommit={onCommit} />);
    const press = screen.getByRole('button', { name: 'My lanes' });
    expect(press.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(press);
    expect(onCommit).toHaveBeenLastCalledWith({ ...NO_FACETS, setAside: ['NONE', 'SBA', 'SBP'] });
    unset.unmount();

    renderWithTheme(<PresetApplied onCommit={onCommit} />);
    const applied = screen.getByRole('button', { name: 'My lanes' });
    expect(applied.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(applied);
    expect(onCommit).toHaveBeenLastCalledWith(NO_FACETS);
  });
});
