import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import * as stories from './pipeline-table.stories';

const { Default, Paged, Saving, Empty } = composeStories(stories);

describe('PipelineTable', () => {
  it('[GOVU-7] rows every tracked notice with its link, deadline, days left, reminder with a due badge, score and stage', () => {
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
    expect(cells[7]).toBe('Ask for drawing 12345678 rev C before quoting.');
    expect(within(rows[1] as HTMLElement).getAllByRole('cell')[4]?.textContent).toBe('—');

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

  it('says when nothing is tracked', () => {
    renderWithTheme(<Empty />);
    expect(screen.getByText(/Nothing tracked here yet/)).toBeTruthy();
  });
});
