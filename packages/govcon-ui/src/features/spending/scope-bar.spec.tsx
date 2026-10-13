import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CODES_SETTLE_MS } from './scope-bar';
import * as stories from './scope-bar.stories';

const { Default, DirectoryLoading, DirectoryFailed, Narrowed } = composeStories(stories);

describe('ScopeBar', () => {
  it('[GOVU-11] [GOVU-12] presses profile codes into the typed list, offers the directory as agencies, chooses the family at once, and hands a run of code changes — pressed or typed — on as one once it pauses', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    renderWithTheme(<Default onChange={onChange} />);
    const chosen = screen.getByRole('button', { name: '332710' });
    expect(chosen.getAttribute('aria-pressed')).toBe('true');

    // Two presses inside the pause: shown at once, handed on together.
    fireEvent.click(screen.getByRole('button', { name: '541511' }));
    expect(screen.getByRole('button', { name: '541511' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(chosen);
    expect(chosen.getAttribute('aria-pressed')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(CODES_SETTLE_MS));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ naics: '541511' }));

    fireEvent.change(screen.getByLabelText('Agency'), { target: { value: '036' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ agency: '036' }));
    expect(screen.getByRole('option', { name: 'DOD — Department of Defense' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Award family'), { target: { value: 'idvs' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ awardFamily: 'idvs' }));

    const calls = onChange.mock.calls.length;
    fireEvent.change(screen.getByLabelText('PSC codes'), { target: { value: 'ac13' } });
    expect((screen.getByLabelText('PSC codes') as HTMLInputElement).value).toBe('AC13');
    expect(onChange).toHaveBeenCalledTimes(calls);
    act(() => vi.advanceTimersByTime(CODES_SETTLE_MS));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ psc: 'AC13' }));
    expect(screen.getByText(/Free: USAspending needs no key/)).toBeTruthy();
    vi.useRealTimers();
  });

  it('[GOVU-14] keeps the facets behind one fold that says how many are set and is open when a link arrives with some, fixes the family as contracts under a placement, hands a select on at once and a run of lane presses as one, and applies the profile’s lanes in one press', () => {
    vi.useFakeTimers();
    const plain = renderWithTheme(<Default />);
    const closed = screen.getByRole('button', { name: 'More filters' });
    expect(closed.getAttribute('aria-expanded')).toBe('false');
    expect((screen.getByLabelText('Award family') as HTMLSelectElement).disabled).toBe(false);
    plain.unmount();

    const onChange = vi.fn();
    renderWithTheme(<Narrowed onChange={onChange} />);
    expect(
      screen.getByRole('button', { name: 'More filters (3 set)' }).getAttribute('aria-expanded'),
    ).toBe('true');
    const family = screen.getByLabelText('Award family') as HTMLSelectElement;
    expect([family.value, family.disabled]).toEqual(['contracts', true]);
    expect(screen.getByText('Set by "Placed as": a kind of contract.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Won by'), { target: { value: 'small' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ facets: expect.objectContaining({ recipientSize: 'small' }) }),
    );

    const calls = onChange.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'NONE' }));
    fireEvent.click(screen.getByRole('button', { name: 'SBP' }));
    expect(onChange).toHaveBeenCalledTimes(calls);
    act(() => vi.advanceTimersByTime(CODES_SETTLE_MS));
    expect(onChange).toHaveBeenCalledTimes(calls + 1);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        facets: expect.objectContaining({ setAside: ['NONE', 'SBA', 'SBP'] }),
      }),
    );

    fireEvent.change(screen.getByLabelText('Placed as'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ facets: expect.objectContaining({ placement: null }) }),
    );
    vi.useRealTimers();
  });

  it('waits for the directory, and says when it failed', () => {
    renderWithTheme(<DirectoryLoading />);
    expect((screen.getByLabelText('Agency') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/Loading the directory/)).toBeTruthy();
    renderWithTheme(<DirectoryFailed />);
    expect(screen.getByText('the service is unreachable')).toBeTruthy();
  });
});
