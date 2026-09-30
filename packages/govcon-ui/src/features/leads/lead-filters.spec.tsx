import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LEAD_FILTERS, toLeadsQuery } from './lead-filters';
import * as stories from './lead-filters.stories';

const { Default, Narrowed, NoChips } = composeStories(stories);

describe('LeadFilters', () => {
  it('[GOVU-2] [GOVU-6] reports every store filter, clamped to what the service accepts, and a chip sets the NAICS', () => {
    const onChange = fn();
    renderWithTheme(<Default onChange={onChange} />);
    const base = { ...DEFAULT_LEAD_FILTERS, minScore: 40 };
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '150' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, minScore: 100 });
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'medium' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, tier: 'medium' });
    fireEvent.change(screen.getByLabelText('Show up to'), { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, limit: 1 });
    fireEvent.click(screen.getByRole('button', { name: '541511' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...base, naics: '541511' });
    fireEvent.change(screen.getByLabelText('NAICS code or family'), { target: { value: '33' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, naics: '33' });
    fireEvent.change(screen.getByLabelText('Set-aside'), { target: { value: 'SBA' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, setAside: 'SBA' });
    fireEvent.change(screen.getByLabelText('Notice type'), { target: { value: 'Sources Sought' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, noticeType: 'Sources Sought' });
    fireEvent.change(screen.getByLabelText('Agency contains'), { target: { value: 'DLA' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, agency: 'DLA' });
    fireEvent.change(screen.getByLabelText('Title or solicitation contains'), {
      target: { value: 'bracket' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, q: 'bracket' });
    fireEvent.change(screen.getByLabelText('Deadline within days'), { target: { value: '-3' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, deadlineWithinDays: 0 });
  });

  it('shows the pressed chip and lets it go back to any', () => {
    const onChange = fn();
    renderWithTheme(<Narrowed onChange={onChange} />);
    const chip = screen.getByRole('button', { name: '332710' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ naics: '' }));
    expect((screen.getByLabelText('Tier') as HTMLSelectElement).value).toBe('high');
  });

  it('shows no chips when the profile offers no codes', () => {
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
      noticeType: undefined,
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
          deadlineWithinDays: 14,
        },
        undefined,
        0,
      ),
    ).toMatchObject({
      naics: '3327',
      tier: 'high',
      agency: 'DLA',
      deadlineWithinDays: 14,
      offset: 0,
    });
  });
});
