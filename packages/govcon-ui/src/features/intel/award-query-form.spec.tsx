import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EMPTY_AWARD_FILTERS } from './award-query-form';
import * as stories from './award-query-form.stories';

const { Default, Narrowed } = composeStories(stories);

describe('AwardQueryForm', () => {
  it('offers the profile codes as one-click chips and every filter as a field', () => {
    const onChange = vi.fn();
    renderWithTheme(<Default onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '332710' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_AWARD_FILTERS, naics: '332710' });
    fireEvent.change(screen.getByLabelText('Agency contains'), { target: { value: 'DLA' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_AWARD_FILTERS, agency: 'DLA' });
    fireEvent.change(screen.getByLabelText('PSC'), { target: { value: ' da01 ' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_AWARD_FILTERS, psc: 'DA01' });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'usaspending' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_AWARD_FILTERS, source: 'usaspending' });
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
