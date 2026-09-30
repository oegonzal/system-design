import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PROFILE } from '../../testing/fixtures';
import { issuesAt } from './editor-fields';
import { weightSum } from './profile-editor';
import * as stories from './profile-editor.stories';

const { Default, Creating, WithIssues, Saving } = composeStories(stories);

describe('ProfileEditor', () => {
  it('[GOVU-1] [GOVU-10] shows the codes, interests, weights, prices, bands and tiers as fields, with the weights summed live', () => {
    const onChange = vi.fn();
    renderWithTheme(<Default onChange={onChange} />);
    expect(screen.getByRole('form', { name: 'Profile enfav' })).toBeTruthy();
    expect((screen.getByLabelText('Id') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Company') as HTMLInputElement).value).toBe('Enfav LLC');
    expect(
      within(screen.getByRole('list', { name: 'NAICS' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent?.replace('✕', '')),
    ).toEqual(['332710', '333249', '541511', '541512']);
    expect((screen.getByLabelText('Interest 1 term') as HTMLInputElement).value).toBe(
      'additive manufacturing',
    );
    expect((screen.getByLabelText('Weight naics') as HTMLInputElement).value).toBe('0.3');
    expect(screen.getByRole('status').textContent).toBe('Weights sum to 1.00');
    expect((screen.getByLabelText('Set-aside price SBA') as HTMLInputElement).value).toBe('1');
    expect(
      (screen.getByLabelText('Notice type price Sources Sought') as HTMLInputElement).value,
    ).toBe('0.7');
    expect((screen.getByLabelText('Deadline band 2 up to days') as HTMLInputElement).value).toBe(
      '14',
    );
    expect((screen.getByLabelText('High tier from') as HTMLInputElement).value).toBe('70');

    fireEvent.change(screen.getByLabelText('Weight naics'), { target: { value: '0.5' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scoring: expect.objectContaining({ weights: { ...PROFILE.scoring.weights, naics: 0.5 } }),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove 53 from PSC' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ psc: ['59', 'DA', '7030'] }),
    );
    fireEvent.change(screen.getByLabelText('Add to NAICS'), { target: { value: '326199' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0] as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ naics: [...PROFILE.naics, '326199'] }),
    );
    expect(weightSum({ ...PROFILE.scoring.weights, naics: 0.5 })).toBe(1.2);
  });

  it('[GOVU-10] puts every issue the service named beside its field, and all of them at the top', () => {
    renderWithTheme(<WithIssues />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]?.textContent).toContain('2 issue(s) — nothing was saved');
    expect(screen.getByText('weights sum to 1.2, not 1')).toBeTruthy();
    const naicsIssue = document.querySelector('[data-path="naics.0"]');
    expect(naicsIssue?.textContent).toContain('Invalid string');
    expect(screen.getByText('Weights sum to 1.20 — they must sum to 1').getAttribute('role')).toBe(
      'alert',
    );
    expect(
      issuesAt(
        [
          { path: 'naics.0', message: 'x' },
          { path: 'naicsCode', message: 'y' },
        ],
        'naics',
      ),
    ).toEqual([{ path: 'naics.0', message: 'x' }]);
  });

  it('[GOVU-10] lets a new profile take an id, submits through the form, and waits while saving', () => {
    const onSave = vi.fn();
    const onChange = vi.fn();
    renderWithTheme(<Creating onSave={onSave} onChange={onChange} />);
    const id = screen.getByLabelText('Id') as HTMLInputElement;
    expect(id.disabled).toBe(false);
    fireEvent.change(id, { target: { value: ' Acme ' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'acme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    renderWithTheme(<Saving />);
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
