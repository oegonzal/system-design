import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeFinding } from '../../testing/fixtures';
import { renderWithTheme } from '../../testing/render';
import { FindingsList } from './findings-list';

const findings = [
  makeFinding({ id: 'f-low', severity: 'low', title: 'Low issue', suggestion: null }),
  makeFinding({ id: 'f-crit', severity: 'critical', title: 'Critical issue' }),
  makeFinding({
    id: 'f-crit-2',
    severity: 'critical',
    title: 'Second critical',
    suggestion: null,
    source: 'llm',
  }),
];

describe('FindingsList', () => {
  it('groups findings by severity in the contract urgency order', () => {
    renderWithTheme(<FindingsList findings={findings} onSelect={vi.fn()} onPreviewFix={vi.fn()} />);

    const groups = screen.getAllByTestId(/^findings-group-/);
    expect(groups.map((group) => group.getAttribute('data-testid'))).toEqual([
      'findings-group-critical',
      'findings-group-low',
    ]);
    expect(
      within(screen.getByTestId('findings-group-critical')).getAllByTestId(/^finding-f-/),
    ).toHaveLength(2);
  });

  it('labels the source: rule vs ai', () => {
    renderWithTheme(<FindingsList findings={findings} onSelect={vi.fn()} onPreviewFix={vi.fn()} />);

    const llmFinding = screen.getByTestId('finding-f-crit-2');
    expect(within(llmFinding).getByText('ai')).toBeTruthy();
    const ruleFinding = screen.getByTestId('finding-f-crit');
    expect(within(ruleFinding).getByText('rule')).toBeTruthy();
  });

  it('clicking a title reports the finding to onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithTheme(
      <FindingsList findings={findings} onSelect={onSelect} onPreviewFix={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Critical issue' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('f-crit');
  });

  it('offers Preview fix only for findings that carry a suggestion', async () => {
    const user = userEvent.setup();
    const onPreviewFix = vi.fn();
    renderWithTheme(
      <FindingsList findings={findings} onSelect={vi.fn()} onPreviewFix={onPreviewFix} />,
    );

    expect(screen.queryByTestId('preview-fix-f-low')).toBeNull();
    await user.click(screen.getByTestId('preview-fix-f-crit'));

    expect(onPreviewFix.mock.calls[0][0].id).toBe('f-crit');
  });

  it('renders an empty state for zero findings', () => {
    renderWithTheme(<FindingsList findings={[]} onSelect={vi.fn()} onPreviewFix={vi.fn()} />);
    expect(screen.getByTestId('findings-empty')).toBeTruthy();
  });
});
