import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makePrompt } from '../../testing/fixtures';
import { PromptPane } from './prompt-pane';

describe('PromptPane', () => {
  it('[UX-14] renders the markdown — the title once, sections under it, the requirement table as a table — the source, and the criteria grouped by kind', () => {
    renderWithTheme(<PromptPane prompt={makePrompt()} />);

    expect(screen.getByTestId('prompt-source').textContent).toBe('Authored');
    const rendered = screen.getByTestId('prompt-markdown');
    expect(screen.getByLabelText('Prompt')).toBe(rendered);
    // The title reads once, as the pane's h2: the document's own opening `#`
    // says the same and is not repeated, and its `##` sections sit under it.
    expect(
      screen.getAllByRole('heading', { name: 'Design an order-history service' }),
    ).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Design an order-history service' })).toBe(
      screen.getAllByRole('heading')[0],
    );
    expect(
      within(rendered).getByRole('heading', { level: 3, name: 'Functional requirements' }),
    ).toBeTruthy();
    expect(within(rendered).queryByRole('heading', { level: 1 })).toBeNull();
    const tables = within(rendered).getAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(within(tables[0]).getByRole('cell', { name: 'p99 ≤ 200 ms' })).toBeTruthy();
    expect(rendered.textContent).not.toContain('| ---');
    expect(rendered.textContent).not.toContain('## ');

    const groups = screen.getAllByTestId(/^criteria-group-/);
    expect(groups.map((group) => group.getAttribute('data-testid'))).toEqual([
      'criteria-group-functional',
      'criteria-group-non_functional',
      'criteria-group-scale',
      'criteria-group-constraint',
    ]);
    const row = screen.getByTestId('criterion-c3');
    expect(within(row).getByTestId('criterion-chip').textContent).toBe('c3');
    expect(row.textContent).toContain('p99 read latency stays under 200 ms');
  });

  it('is the page’s h1 where the prompt is the page, and everything under it steps down from there', () => {
    renderWithTheme(<PromptPane prompt={makePrompt()} titleLevel={1} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Design an order-history service' }),
    ).toBeTruthy();
    const rendered = screen.getByTestId('prompt-markdown');
    expect(within(rendered).getByRole('heading', { level: 2, name: 'Scenario' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Criteria' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Non-functional' })).toBeTruthy();
  });

  it('[UX-14] badges an archived prompt', () => {
    renderWithTheme(<PromptPane prompt={makePrompt({ status: 'archived' })} />);
    expect(screen.getByTestId('prompt-archived').textContent).toBe('Archived');
  });

  it('[UX-14] shows the normalizing state while the rubric is derived', () => {
    renderWithTheme(<PromptPane prompt={makePrompt({ criteria: [] })} deriving />);
    expect(screen.getByTestId('prompt-criteria-normalizing')).toBeTruthy();
    expect(screen.queryByTestId('prompt-criteria-empty')).toBeNull();
  });

  it('[UX-14] says the grader is unavailable and offers to derive again', async () => {
    const user = userEvent.setup();
    const onDerive = vi.fn();
    renderWithTheme(
      <PromptPane
        prompt={makePrompt({ criteria: [] })}
        deriveError="Service Unavailable"
        onDerive={onDerive}
      />,
    );

    const empty = screen.getByTestId('prompt-criteria-empty');
    expect(empty.textContent).toContain('grader is unavailable');
    expect(empty.textContent).toContain('Service Unavailable');
    await user.click(screen.getByTestId('derive-criteria'));
    expect(onDerive).toHaveBeenCalledTimes(1);
  });

  it('prefers the resolved criteria over the prompt’s own', () => {
    renderWithTheme(
      <PromptPane
        prompt={makePrompt({ criteria: [] })}
        criteria={[{ id: 'c1', kind: 'functional', statement: 'Freshly derived' }]}
      />,
    );
    expect(screen.getByTestId('criterion-c1').textContent).toContain('Freshly derived');
  });
});
