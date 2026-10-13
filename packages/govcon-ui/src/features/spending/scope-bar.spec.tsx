import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CODES_SETTLE_MS } from './scope-bar';
import * as stories from './scope-bar.stories';

const { Default, DirectoryLoading, DirectoryFailed } = composeStories(stories);

describe('ScopeBar', () => {
  it('[GOVU-11] [GOVU-12] toggles profile codes into the typed list at once, offers the directory as agencies, chooses the family, and settles typed codes before handing them on', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    renderWithTheme(<Default onChange={onChange} />);
    const chosen = screen.getByRole('button', { name: '332710' });
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '541511' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ naics: '332710, 541511' }));
    fireEvent.click(chosen);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ naics: '' }));

    fireEvent.change(screen.getByLabelText('Agency'), { target: { value: '036' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ agency: '036' }));
    expect(screen.getByRole('option', { name: 'DOD — Department of Defense' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Award family'), { target: { value: 'idvs' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ awardFamily: 'idvs' }));
    fireEvent.change(screen.getByLabelText('PSC codes'), { target: { value: 'ac13' } });
    expect((screen.getByLabelText('PSC codes') as HTMLInputElement).value).toBe('AC13');
    expect(onChange).not.toHaveBeenLastCalledWith(expect.objectContaining({ psc: 'AC13' }));
    act(() => vi.advanceTimersByTime(CODES_SETTLE_MS));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ psc: 'AC13' }));
    expect(screen.getByText(/Free: USAspending needs no key/)).toBeTruthy();
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
