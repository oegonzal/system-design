import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeProgress } from '../../testing/fixtures';
import { CompetenciesPanel, orderWeakestFirst } from './competencies-panel';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('orderWeakestFirst', () => {
  it('[UX-30] puts the lowest pass share first, ties to the kind assessed less, and the kinds never assessed last in their given order', () => {
    const kinds = orderWeakestFirst(makeProgress().competencies).map(
      (competency) => competency.kind,
    );
    expect(kinds.slice(0, 2)).toEqual(['tradeoff', 'functional']);
    expect(kinds.slice(2)).toEqual(
      makeProgress()
        .competencies.filter((competency) => competency.assessed === 0)
        .map((competency) => competency.kind),
    );
    const tie = orderWeakestFirst([
      {
        ...makeProgress().competencies[0],
        kind: 'a',
        assessed: 4,
        passed: 2,
        partial: 0,
        failed: 2,
      },
      {
        ...makeProgress().competencies[0],
        kind: 'b',
        assessed: 2,
        passed: 1,
        partial: 0,
        failed: 1,
      },
    ]);
    expect(tie.map((competency) => competency.kind)).toEqual(['b', 'a']);
  });
});

describe('CompetenciesPanel', () => {
  it('[UX-30] shows every kind weakest first with its counts as text and a Practise-this link onto the emphasising format', async () => {
    stubApi([{ path: '/api/progress', body: { data: makeProgress() } }]);
    renderWithTheme(<CompetenciesPanel />);

    const panel = await screen.findByTestId('competencies-panel');
    const rows = within(panel).getAllByTestId('competency-row');
    expect(rows.map((row) => row.getAttribute('data-kind')).slice(0, 2)).toEqual([
      'tradeoff',
      'functional',
    ]);
    const weakest = rows.at(0);
    const last = rows.at(-1);
    if (!weakest || !last) throw new Error('the panel listed no competencies');
    expect(within(weakest).getByTestId('competency-counts').textContent).toBe(
      '1 passed · 0 partial · 2 failed · last practised 10/18/2026 · last sessions 0%, 33%',
    );
    expect(within(weakest).getByTestId('competency-practise').getAttribute('href')).toBe(
      '/prompts/new?format=system&emphasis=tradeoff',
    );
    expect(within(last).getByText('Not assessed yet.')).toBeTruthy();
    expect(
      rows.map((row) => within(row).getByTestId('competency-practise').getAttribute('href')),
    ).toContain('/prompts/new?format=workflow&emphasis=workflow');
  });

  it('[UX-30] says so while nothing has been graded, and offers a Retry when the read fails', async () => {
    stubApi([{ path: '/api/progress', body: { data: makeProgress({ sessions: 0 }) } }]);
    renderWithTheme(<CompetenciesPanel />);
    expect(await screen.findByTestId('competencies-empty')).toBeTruthy();
    vi.unstubAllGlobals();

    // The first read fails, the retry answers.
    let reads = 0;
    stubApi([
      {
        path: '/api/progress',
        handler: () =>
          reads++ === 0
            ? { status: 503, body: { statusCode: 503, message: 'loop is down' } }
            : { body: { data: makeProgress() } },
      },
    ]);
    renderWithTheme(<CompetenciesPanel />);
    const [alert] = await screen.findAllByTestId('competencies-error');
    if (!alert) throw new Error('no retry alert');
    await userEvent.click(within(alert).getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(screen.getAllByTestId('competencies-panel')).toHaveLength(1));
  });
});
