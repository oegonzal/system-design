import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FIRM_TARGET, TARGET } from '../../testing/pipeline-fixtures';
import * as stories from './target-panel.stories';

const { Untracked, Tracked, Firm, Saving, Refused } = composeStories(stories);

const stages = (): string[] =>
  within(screen.getByLabelText('Stage'))
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');

describe('TargetPanel', () => {
  it('[GOVU-20] tracks an award from its kind’s first stage under the name it is given, with nothing yet to reach, keep or do, and says what tracking an award does', () => {
    const onSave = vi.fn();
    renderWithTheme(<Untracked onSave={onSave} />);
    expect(screen.getByText('not tracked')).toBeTruthy();
    expect(screen.getByText(/The daily warm reads a tracked award/)).toBeTruthy();
    expect(stages()).toEqual(['watching', 'researching', 'positioning', 'pursuing', 'passed']);
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Track this award' }));
    expect(onSave).toHaveBeenCalledWith({
      label: TARGET.label,
      stage: 'watching',
      notes: '',
      nextAction: '',
      contacts: [],
      links: [],
      activity: [],
      reminderAt: null,
    });
  });

  it('[GOVU-20] shows a tracked target’s stage and how long it has stood, saves the stage, next action, contacts, reminder and notes as one request with a cleared reminder as none, and stops tracking it', () => {
    const onSave = vi.fn();
    const onRemove = vi.fn();
    renderWithTheme(<Tracked onSave={onSave} onRemove={onRemove} />);
    expect(screen.getByText('in this stage since 2026-09-27')).toBeTruthy();
    expect((screen.getByLabelText('Contact 1 name') as HTMLInputElement).value).toBe(
      'A. Contracting Officer',
    );
    expect((screen.getByLabelText('Next action') as HTMLInputElement).value).toBe(
      'Ask when the recompete posts.',
    );
    expect((screen.getByLabelText('Reminder (UTC)') as HTMLInputElement).value).toBe(
      '2026-10-05T15:00',
    );

    fireEvent.change(screen.getByLabelText('Stage'), { target: { value: 'positioning' } });
    fireEvent.change(screen.getByLabelText('Next action'), {
      target: { value: 'Call B. Officer.' },
    });
    fireEvent.change(screen.getByLabelText('Reminder (UTC)'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Draft out in April.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      label: TARGET.label,
      stage: 'positioning',
      notes: 'Draft out in April.',
      nextAction: 'Call B. Officer.',
      contacts: [
        { name: 'A. Contracting Officer', role: 'program-manager', channel: '', note: '' },
      ],
      links: [],
      activity: [],
      reminderAt: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('[GOVU-28] edits a firm’s contacts and links as rows, logs an activity of a declared kind at the instant given, and writes every list whole', () => {
    const onSave = vi.fn();
    renderWithTheme(<Firm onSave={onSave} />);
    expect(screen.getByText('Sent the statement.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(
      'https://suppliers.example.com/',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    fireEvent.change(screen.getByLabelText('Contact 2 name'), { target: { value: 'P. Manager' } });
    fireEvent.change(screen.getByLabelText('Contact 2 role'), {
      target: { value: 'program-manager' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove link 1' }));
    fireEvent.change(screen.getByLabelText('Logged activity'), { target: { value: 'called' } });
    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'Left a message.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect((screen.getByLabelText('What happened') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Left a message.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        nextAction: FIRM_TARGET.nextAction,
        contacts: [
          ...FIRM_TARGET.contacts,
          { name: 'P. Manager', role: 'program-manager', channel: '', note: '' },
        ],
        links: [],
        activity: [
          ...FIRM_TARGET.activity,
          { at: '2026-09-27T12:00:00.000Z', kind: 'called', summary: 'Left a message.', ref: null },
        ],
      }),
    );
  });

  it('[GOVU-20] gives a firm its own stages and its own words, waits while a write is in flight, and shows why one was refused', () => {
    const firm = renderWithTheme(<Firm />);
    expect(stages()).toEqual(['identified', 'contacted', 'talking', 'teamed', 'passed']);
    expect((screen.getByLabelText('Stage') as HTMLSelectElement).value).toBe(FIRM_TARGET.stage);
    expect(screen.getByText(/says when an outreach has gone unanswered/)).toBeTruthy();
    firm.unmount();

    const saving = renderWithTheme(<Saving />);
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).disabled).toBe(true);
    saving.unmount();

    renderWithTheme(<Refused />);
    expect(screen.getByRole('alert').textContent).toContain('nextAction: Too big');
  });
});
