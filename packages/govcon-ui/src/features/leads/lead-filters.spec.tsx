import { EARLY_NOTICE_TYPES } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_LEAD_FILTERS,
  FILTERS_SETTLE_MS,
  LeadFiltersControls,
  toLeadsQuery,
  type LeadFilters,
} from './lead-filters';
import * as stories from './lead-filters.stories';

const { Narrowed, EarlyNotices, NoChips } = composeStories(stories);
const BASE: LeadFilters = { ...DEFAULT_LEAD_FILTERS, minScore: 40 };

/** The controls over an owner that keeps what it is handed, the way a page does. */
function Owned({ onChange }: { onChange(next: LeadFilters): void }) {
  const [value, setValue] = useState(BASE);
  return (
    <LeadFiltersControls
      value={value}
      naicsChoices={['332710', '541511']}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}
const settle = () => act(() => vi.advanceTimersByTime(FILTERS_SETTLE_MS));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('LeadFilters', () => {
  it('[GOVU-2] [GOVU-6] reports every store filter, clamped to what the service accepts: a select and a profile chip at once, typed text and notice-type chips once they pause, and a field left at once', () => {
    const onChange = vi.fn();
    renderWithTheme(<Owned onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'medium' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, tier: 'medium' });
    fireEvent.change(screen.getByLabelText('Set-aside'), { target: { value: 'SBA' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, tier: 'medium', setAside: 'SBA' });
    fireEvent.click(screen.getByRole('button', { name: '541511' }));
    const chosen = { ...BASE, tier: 'medium' as const, setAside: 'SBA', naics: '541511' };
    expect(onChange).toHaveBeenLastCalledWith(chosen);

    // Typing is one change once it pauses, not one per keystroke.
    const calls = onChange.mock.calls.length;
    const agency = screen.getByLabelText('Agency contains') as HTMLInputElement;
    fireEvent.change(agency, { target: { value: 'D' } });
    fireEvent.change(agency, { target: { value: 'DLA' } });
    expect(agency.value).toBe('DLA');
    expect(onChange).toHaveBeenCalledTimes(calls);
    settle();
    expect(onChange).toHaveBeenCalledTimes(calls + 1);
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, agency: 'DLA' });

    // A field left hands on what is pending without waiting.
    fireEvent.change(screen.getByLabelText('Title or solicitation contains'), {
      target: { value: 'bracket' },
    });
    fireEvent.blur(screen.getByLabelText('Title or solicitation contains'));
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, agency: 'DLA', q: 'bracket' });

    // Numbers are clamped to what the service accepts.
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Show up to'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Deadline within days'), { target: { value: '-3' } });
    settle();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ minScore: 100, limit: 1, deadlineWithinDays: 0 }),
    );
  });

  it('[GOVU-22] offers every notice type as a chip, hands a run of presses on as one change, and presses the two a buyer posts before it solicits with one preset that also lets them go', () => {
    const onChange = vi.fn();
    renderWithTheme(<Owned onChange={onChange} />);
    const types = within(screen.getByRole('group', { name: 'Notice types' }));
    expect(types.getAllByRole('button')).toHaveLength(9);

    fireEvent.click(types.getByRole('button', { name: 'Solicitation' }));
    fireEvent.click(types.getByRole('button', { name: 'Combined Synopsis/Solicitation' }));
    expect(onChange).not.toHaveBeenCalled();
    settle();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({
      ...BASE,
      noticeTypes: ['Solicitation', 'Combined Synopsis/Solicitation'],
    });

    const preset = screen.getByRole('button', { name: 'Early notices' });
    expect(preset.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(preset);
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, noticeTypes: [...EARLY_NOTICE_TYPES] });
    expect(preset.getAttribute('aria-pressed')).toBe('true');
    expect(types.getByRole('button', { name: 'Sources Sought' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(types.getByRole('button', { name: 'Solicitation' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    fireEvent.click(preset);
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, noticeTypes: [] });
  });

  it('shows what is set — the pressed profile chip, the pressed types, the preset when exactly its two are pressed — lets a chip go back to any, and shows no profile chips when there are no codes', () => {
    const onChange = vi.fn();
    const narrowed = renderWithTheme(<Narrowed onChange={onChange} />);
    const chip = screen.getByRole('button', { name: '332710' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ naics: '' }));
    expect((screen.getByLabelText('Tier') as HTMLSelectElement).value).toBe('high');
    expect(screen.getByRole('button', { name: 'Solicitation' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Early notices' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    narrowed.unmount();

    const early = renderWithTheme(<EarlyNotices />);
    expect(screen.getByRole('button', { name: 'Early notices' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    early.unmount();

    renderWithTheme(<NoChips />);
    expect(screen.queryByText('Profile NAICS')).toBeNull();
    expect(screen.getByLabelText('NAICS code or family')).toBeTruthy();
  });

  it('[GOVU-6] spells the query as GET /leads takes it — empties dropped, the page named', () => {
    expect(toLeadsQuery(DEFAULT_LEAD_FILTERS, 'enfav', 25)).toEqual({
      profile: 'enfav',
      minScore: 0,
      tier: undefined,
      naics: undefined,
      setAside: undefined,
      noticeTypes: undefined,
      agency: undefined,
      q: undefined,
      deadlineWithinDays: undefined,
      limit: 25,
      offset: 25,
    });
    expect(
      toLeadsQuery(
        {
          ...DEFAULT_LEAD_FILTERS,
          naics: ' 3327 ',
          tier: 'high',
          agency: 'DLA',
          noticeTypes: ['Sources Sought', 'Presolicitation'],
          deadlineWithinDays: 14,
        },
        undefined,
        0,
      ),
    ).toMatchObject({
      naics: '3327',
      tier: 'high',
      agency: 'DLA',
      noticeTypes: ['Sources Sought', 'Presolicitation'],
      deadlineWithinDays: 14,
      offset: 0,
    });
  });
});
