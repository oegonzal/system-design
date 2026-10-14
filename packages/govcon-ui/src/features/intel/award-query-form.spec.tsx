import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AWARD_FILTERS_SETTLE_MS,
  AwardQueryForm,
  EMPTY_AWARD_FILTERS,
  type AwardFilters,
} from './award-query-form';
import * as stories from './award-query-form.stories';

const { Narrowed } = composeStories(stories);

/** The form over an owner that keeps what it is handed, the way a page does. */
function Owned({ onChange }: { onChange(next: AwardFilters): void }) {
  const [value, setValue] = useState(EMPTY_AWARD_FILTERS);
  return (
    <AwardQueryForm
      value={value}
      naicsOptions={['332710', '541511']}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('AwardQueryForm', () => {
  it('[GOVU-9] offers the profile codes as one-click chips and every filter as a field: a chip, a date and a select handed on at once, typed text once it pauses or the field is left', () => {
    const onChange = vi.fn();
    renderWithTheme(<Owned onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '332710' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_AWARD_FILTERS, naics: '332710' });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'usaspending' } });
    const chosen = { ...EMPTY_AWARD_FILTERS, naics: '332710', source: 'usaspending' as const };
    expect(onChange).toHaveBeenLastCalledWith(chosen);
    fireEvent.change(screen.getByLabelText('Signed from'), { target: { value: '2026-01-01' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, from: '2026-01-01' });

    const calls = onChange.mock.calls.length;
    const agency = screen.getByLabelText('Agency contains') as HTMLInputElement;
    fireEvent.change(agency, { target: { value: 'D' } });
    fireEvent.change(agency, { target: { value: 'DLA' } });
    expect(agency.value).toBe('DLA');
    expect(onChange).toHaveBeenCalledTimes(calls);
    act(() => vi.advanceTimersByTime(AWARD_FILTERS_SETTLE_MS));
    expect(onChange).toHaveBeenCalledTimes(calls + 1);
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, from: '2026-01-01', agency: 'DLA' });

    fireEvent.change(screen.getByLabelText('PSC'), { target: { value: ' da01 ' } });
    fireEvent.blur(screen.getByLabelText('PSC'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ psc: 'DA01' }));
  });

  it('marks the pressed chip and clears it on a second press', () => {
    const onChange = vi.fn();
    renderWithTheme(<Narrowed onChange={onChange} />);
    const chip = screen.getByRole('button', { name: '332710' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ naics: '' }));
    expect((screen.getByLabelText('Source') as HTMLSelectElement).value).toBe('sam.gov');
  });
});
