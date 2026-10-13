import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import * as stories from './pipeline-table.stories';

const { Default, Editing, Paged, Refused, Saving, Empty } = composeStories(stories);

const NOTICE_ID = '21b781192a4f4026a2946237984a9c06';

describe('PipelineTable', () => {
  it('[GOVU-7] rows every tracked notice with its link, deadline, days left, reminder with a due badge, score, estimate and stage', () => {
    const onStageChange = fn();
    renderWithTheme(<Default onStageChange={onStageChange} />);
    const rows = within(screen.getByRole('table', { name: 'Pipeline' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(3);
    const first = within(rows[0] as HTMLElement);
    expect(first.getByRole('link', { name: /JUNCTION BOX/ }).getAttribute('href')).toBe(
      '/notices/21b781192a4f4026a2946237984a9c06',
    );
    const cells = first.getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells[1]).toBe('NAVSUP WEAPON SYSTEMS SUPPORT');
    expect(cells[2]).toBe('2026-10-26');
    expect(cells[3]).toBe('31 day(s)');
    expect(cells[4]).toBe('2026-10-01due');
    expect(cells[5]).toBe('71.5 high');
    expect(cells[6]).toBe('$48K');
    expect(cells[8]).toBe('Ask for drawing 12345678 rev C before quoting.');
    const second = within(rows[1] as HTMLElement).getAllByRole('cell');
    expect([second[4]?.textContent, second[6]?.textContent]).toEqual(['—', '—']);

    fireEvent.change(first.getByLabelText(/^Stage of/), { target: { value: 'preparing' } });
    expect(onStageChange).toHaveBeenCalledWith('21b781192a4f4026a2946237984a9c06', 'preparing');
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('[GOVU-7] pages a longer pipeline and waits while a stage is written', () => {
    const onPage = fn();
    renderWithTheme(<Paged onPage={onPage} />);
    expect(screen.getByText('120 tracked · showing 51–53 of 120')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(100);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenCalledWith(0);
    const { container } = renderWithTheme(<Saving />);
    const selects = Array.from(container.querySelectorAll('select'));
    expect(selects).toHaveLength(3);
    expect(selects.every((select) => select.disabled)).toBe(true);
  });

  it('[GOVU-7] opens the whole bid under its row — the stage, reminder, estimate and notes as stored — and hands every field of a save, a removal and a close to the page', () => {
    const onEdit = fn();
    const onSave = fn();
    const onRemove = fn();
    const closedTable = renderWithTheme(<Default onEdit={onEdit} />);
    const closed = screen.getByRole('button', { name: /^Edit the bid on .*JUNCTION BOX/ });
    expect(closed.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(closed);
    expect(onEdit).toHaveBeenCalledWith(NOTICE_ID);
    closedTable.unmount();

    const openTable = renderWithTheme(
      <Editing onEdit={onEdit} onSave={onSave} onRemove={onRemove} />,
    );
    const toggle = screen.getByRole('button', { name: /^Close the bid on .*JUNCTION BOX/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const editor = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    const bid = within(editor as HTMLElement);
    // One control for the stage while the bid is open: the row shows it, the bid edits it.
    expect(screen.getAllByLabelText(/^Stage of/)).toHaveLength(2);
    expect((bid.getByLabelText('Stage') as HTMLSelectElement).value).toBe('qualifying');
    expect((bid.getByLabelText('Reminder (UTC)') as HTMLInputElement).value).toBe(
      '2026-10-01T09:00',
    );
    expect((bid.getByLabelText('Estimated value (USD)') as HTMLInputElement).value).toBe('48000');

    fireEvent.change(bid.getByLabelText('Reminder (UTC)'), {
      target: { value: '2026-11-02T15:30' },
    });
    fireEvent.change(bid.getByLabelText('Estimated value (USD)'), { target: { value: '' } });
    fireEvent.change(bid.getByLabelText('Notes'), { target: { value: 'Quote by the 2nd.' } });
    fireEvent.click(bid.getByRole('button', { name: 'Save bid' }));
    expect(onSave).toHaveBeenCalledWith(NOTICE_ID, {
      stage: 'qualifying',
      notes: 'Quote by the 2nd.',
      reminderAt: '2026-11-02T15:30:00.000Z',
      estimatedValue: null,
    });
    fireEvent.click(bid.getByRole('button', { name: 'Remove from pipeline' }));
    expect(onRemove).toHaveBeenCalledWith(NOTICE_ID);
    fireEvent.click(toggle);
    expect(onEdit).toHaveBeenLastCalledWith(null);
    openTable.unmount();

    renderWithTheme(<Refused />);
    expect(screen.getByText('estimatedValue: must not be negative')).toBeTruthy();
  });

  it('says when nothing is tracked', () => {
    renderWithTheme(<Empty />);
    expect(screen.getByText(/Nothing tracked here yet/)).toBeTruthy();
  });
});
