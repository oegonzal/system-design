import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FIRM_TARGET, TARGET } from '../../testing/pipeline-fixtures';
import * as stories from './targets-table.stories';

const { Default, Editing, Paged, Empty } = composeStories(stories);

const rowsOf = () =>
  within(screen.getByRole('table', { name: 'Tracked firms and awards' }))
    .getAllByRole('row')
    .slice(1);

describe('TargetsTable', () => {
  it('[GOVU-20] rows every tracked firm and award by its kind and name, the name a link to its own page, with its reminder marked when due, an award’s end as last read, who to reach, what to do next and what was last done', () => {
    renderWithTheme(<Default />);
    const [award, firm] = rowsOf();
    expect(within(award as HTMLElement).getByText('Award')).toBeTruthy();
    expect(
      within(award as HTMLElement)
        .getByRole('link', { name: TARGET.label })
        .getAttribute('href'),
    ).toBe(`/awards/${TARGET.subject}`);
    // The award's end, as the warm last read it; the firm has none.
    expect(award?.textContent).toContain('2026-12-26');
    expect(within(award as HTMLElement).queryByText('due')).toBeNull();

    expect(within(firm as HTMLElement).getByText('Firm')).toBeTruthy();
    expect(
      within(firm as HTMLElement)
        .getByRole('link', { name: FIRM_TARGET.label })
        .getAttribute('href'),
    ).toBe('/primes/JCBMLGPE6Z71');
    expect(firm?.textContent).toContain('2026-09-29');
    expect(within(firm as HTMLElement).getByText('due')).toBeTruthy();
    expect(firm?.textContent).toContain('Jane Doe · Small business liaison');
    expect(firm?.textContent).toContain('Ask for the program manager.');
    expect(firm?.textContent).toContain('2026-09-25 Emailed');
    expect(firm?.textContent).toContain('Met at the industry day.');
  });

  it('[GOVU-20] changes a stage in the row from the stages of that row’s own kind, opens the whole of a target under its row in the panel its page uses, and pages', () => {
    const onStageChange = vi.fn();
    const onEdit = vi.fn();
    const closed = renderWithTheme(<Default onStageChange={onStageChange} onEdit={onEdit} />);
    const firmStage = screen.getByLabelText(`Stage of ${FIRM_TARGET.label}`);
    expect(
      within(firmStage)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['identified', 'contacted', 'talking', 'teamed', 'passed']);
    expect(
      within(screen.getByLabelText(`Stage of ${TARGET.label}`))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['watching', 'researching', 'positioning', 'pursuing', 'passed']);
    fireEvent.change(firmStage, { target: { value: 'talking' } });
    expect(onStageChange).toHaveBeenCalledWith(FIRM_TARGET, 'talking');
    fireEvent.click(screen.getByRole('button', { name: `Edit ${FIRM_TARGET.label}` }));
    expect(onEdit).toHaveBeenCalledWith(FIRM_TARGET.id);
    closed.unmount();

    const onSave = vi.fn();
    const onRemove = vi.fn();
    const open = renderWithTheme(<Editing onSave={onSave} onRemove={onRemove} onEdit={onEdit} />);
    // The open panel holds the stage: the row shows it as a word, not a second control.
    expect(screen.queryByLabelText(`Stage of ${FIRM_TARGET.label}`)).toBeNull();
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Call back Friday.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(
      FIRM_TARGET,
      expect.objectContaining({ label: FIRM_TARGET.label, notes: 'Call back Friday.' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    expect(onRemove).toHaveBeenCalledWith(FIRM_TARGET);
    fireEvent.click(screen.getByRole('button', { name: `Close ${FIRM_TARGET.label}` }));
    expect(onEdit).toHaveBeenLastCalledWith(null);
    open.unmount();

    const onPage = vi.fn();
    const paged = renderWithTheme(<Paged onPage={onPage} />);
    expect(screen.getByText('2–2 of 120')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
    paged.unmount();

    renderWithTheme(<Empty />);
    expect(screen.getByText(/Nothing tracked here yet/)).toBeTruthy();
  });
});
