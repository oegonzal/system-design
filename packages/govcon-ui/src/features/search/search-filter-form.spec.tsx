import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import { cleanFilter } from './search-filter-form';
import * as stories from './search-filter-form.stories';

const { Default, Editing, Blank, SourceDisabled } = composeStories(stories);

describe('SearchFilterForm', () => {
  it('[GOVU-6] offers every SAM.gov filter and the window, and reports each change as the query filter', () => {
    const onFilterChange = fn();
    const onDaysChange = fn();
    renderWithTheme(<Default onFilterChange={onFilterChange} onDaysChange={onDaysChange} />);
    fireEvent.change(screen.getByLabelText('Notice type'), { target: { value: 'o' } });
    expect(onFilterChange).toHaveBeenLastCalledWith({
      naics: '332710',
      status: 'active',
      noticeType: 'o',
    });
    fireEvent.change(screen.getByLabelText('Set-aside'), { target: { value: 'SBA' } });
    expect(onFilterChange).toHaveBeenLastCalledWith({
      naics: '332710',
      status: 'active',
      setAside: 'SBA',
    });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '' } });
    expect(onFilterChange).toHaveBeenLastCalledWith({ naics: '332710', status: undefined });
    fireEvent.change(screen.getByLabelText('Title contains'), { target: { value: 'bracket' } });
    expect(onFilterChange).toHaveBeenLastCalledWith({
      naics: '332710',
      status: 'active',
      title: 'bracket',
    });
    fireEvent.change(screen.getByLabelText('Response deadline from'), {
      target: { value: '2026-10-01' },
    });
    expect(onFilterChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ deadlineFrom: '2026-10-01' }),
    );
    fireEvent.change(screen.getByLabelText('Posted in the last N days'), {
      target: { value: '900' },
    });
    expect(onDaysChange).toHaveBeenLastCalledWith(366);
    for (const label of [
      'PSC',
      'Solicitation number',
      'Notice id',
      'State (place of performance)',
      'ZIP',
      'Organization name',
      'Organization code',
      'Response deadline to',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('[GOVU-6] runs for one request per page, saves only under a name, and updates when editing', () => {
    const onRun = fn();
    const onSave = fn();
    const onNameChange = fn();
    renderWithTheme(<Default onRun={onRun} onSave={onSave} onNameChange={onNameChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run (1 request per page)' }));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole('button', { name: 'Save (no request)' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Save as'), { target: { value: 'Machine shops' } });
    expect(onNameChange).toHaveBeenLastCalledWith('Machine shops');

    const onCancelEdit = fn();
    renderWithTheme(<Editing onSave={onSave} onCancelEdit={onCancelEdit} />);
    expect(screen.getByRole('heading', { name: 'Editing "Machine shops"' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update saved search' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it('keeps both buttons off for a blank filter or a disabled source, and drops empties from a filter', () => {
    renderWithTheme(<Blank />);
    expect(
      (screen.getByRole('button', { name: 'Run (1 request per page)' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    renderWithTheme(<SourceDisabled />);
    expect(screen.getByText(/SAM.gov cannot be called: SAM_GOV_API_KEY is not set/)).toBeTruthy();
    expect(
      (
        screen
          .getAllByRole('button', { name: 'Run (1 request per page)' })
          .at(-1) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(cleanFilter({ naics: ' ', title: 'x', psc: '', status: 'active' })).toEqual({
      title: 'x',
      status: 'active',
    });
  });
});
