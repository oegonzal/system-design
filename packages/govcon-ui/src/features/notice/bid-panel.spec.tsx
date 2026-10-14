import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import { fromReminderInput, toReminderInput } from '../reminder-input';
import * as stories from './bid-panel.stories';

const { Untracked, Tracked, Saving, Failed } = composeStories(stories);

describe('BidPanel', () => {
  it('[GOVU-8] tracks an untracked notice with the stage, notes, reminder and estimate as entered', () => {
    const onSave = fn();
    renderWithTheme(<Untracked onSave={onSave} />);
    expect(screen.getByText('not in the pipeline')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Stage'), { target: { value: 'qualifying' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Ask for the drawing' } });
    fireEvent.change(screen.getByLabelText('Reminder (UTC)'), {
      target: { value: '2026-10-01T09:00' },
    });
    fireEvent.change(screen.getByLabelText('Estimated value (USD)'), {
      target: { value: '48000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Track this notice' }));
    expect(onSave).toHaveBeenCalledWith({
      stage: 'qualifying',
      notes: 'Ask for the drawing',
      reminderAt: '2026-10-01T09:00:00.000Z',
      estimatedValue: 48000,
    });
    expect(screen.queryByRole('button', { name: 'Remove from pipeline' })).toBeNull();
  });

  it('[GOVU-8] fills the form from the stored bid, writes a cleared reminder as null, and removes on request', () => {
    const onSave = fn();
    const onRemove = fn();
    renderWithTheme(<Tracked onSave={onSave} onRemove={onRemove} />);
    expect(screen.getByText('qualifying', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText(/in this stage since 2026-09-27/)).toBeTruthy();
    expect((screen.getByLabelText('Reminder (UTC)') as HTMLInputElement).value).toBe(
      '2026-10-01T09:00',
    );
    expect((screen.getByLabelText('Estimated value (USD)') as HTMLInputElement).value).toBe(
      '48000',
    );
    fireEvent.change(screen.getByLabelText('Reminder (UTC)'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Stage'), { target: { value: 'submitted' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save bid' }));
    expect(onSave).toHaveBeenCalledWith({
      stage: 'submitted',
      notes: 'Ask for drawing 12345678 rev C before quoting.',
      reminderAt: null,
      estimatedValue: 48000,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove from pipeline' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('waits while saving, shows the service refusal, and spells the reminder in UTC both ways', () => {
    renderWithTheme(<Saving />);
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    renderWithTheme(<Failed />);
    expect(screen.getByRole('alert').textContent).toBe('no stored notice abc');
    expect(toReminderInput('2026-10-01T09:30:00.000Z')).toBe('2026-10-01T09:30');
    expect(toReminderInput(null)).toBe('');
    expect(fromReminderInput('2026-10-01T09:30')).toBe('2026-10-01T09:30:00.000Z');
    expect(fromReminderInput('')).toBeNull();
  });
});
