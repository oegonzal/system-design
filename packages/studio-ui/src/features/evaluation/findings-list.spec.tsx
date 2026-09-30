import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeCriteria, makeFinding } from '../../testing/fixtures';
import { FindingsList } from './findings-list';

const findings = [
  makeFinding({ id: 'f-low', severity: 'low', type: 'operability_gap', criterionIds: [] }),
  makeFinding({
    id: 'f-crit',
    severity: 'critical',
    lenses: ['critic.architecture', 'critic.scenarios'],
  }),
  makeFinding({
    id: 'f-claim',
    severity: 'critical',
    type: 'unbacked_claim',
    lenses: ['critic.explanation'],
    locations: [{ ref: 'binding.2', label: 'c3 ← n-3', part: 'binding', key: 'c3' }],
    locationRefs: ['binding.2'],
    nodeIds: [],
    rationale: 'binding.2 claims a replica the canvas does not draw.',
    reconciledTo: 'c3',
  }),
];

describe('FindingsList', () => {
  it('groups findings by severity in the contract urgency order', () => {
    renderWithTheme(<FindingsList findings={findings} onSelect={vi.fn()} />);

    const groups = screen.getAllByTestId(/^findings-group-/);
    expect(groups.map((group) => group.getAttribute('data-testid'))).toEqual([
      'findings-group-critical',
      'findings-group-low',
    ]);
    expect(
      within(screen.getByTestId('findings-group-critical')).getAllByTestId(/^finding-f-/),
    ).toHaveLength(2);
  });

  it('[EVAL-2] shows every lens that confirmed a finding, its type, confidence and fixability', () => {
    renderWithTheme(<FindingsList findings={findings} onSelect={vi.fn()} />);

    const item = screen.getByTestId('finding-f-crit');
    expect(
      within(item)
        .getAllByTestId('finding-lens')
        .map((chip) => chip.textContent),
    ).toEqual(['critic.architecture', 'critic.scenarios']);
    expect(within(item).getByTestId('finding-type').textContent).toBe('unhandled_failure');
    expect(item.textContent).toContain('high confidence');
    expect(item.textContent).toContain('fixable local');
  });

  it('[EVAL-2] shows every location a finding cites by its label, with the raw ref as its title, and reads the rationale with ids replaced', () => {
    renderWithTheme(<FindingsList findings={findings} onSelect={vi.fn()} />);

    const chips = within(screen.getByTestId('finding-f-crit')).getAllByTestId('finding-location');
    expect(chips.map((chip) => chip.textContent)).toEqual(['n-3 · database · Orders DB']);
    expect(chips[0].getAttribute('title')).toBe('node.3');
    expect(screen.getByTestId('finding-f-crit').textContent).not.toContain('at node.3');

    const claim = screen.getByTestId('finding-f-claim');
    expect(claim.textContent).toContain('c3 ← n-3 claims a replica the canvas does not draw.');
    expect(claim.textContent).not.toContain('binding.2 claims');
  });

  it('chips the criteria a finding names, carrying the statement as a title', () => {
    renderWithTheme(
      <FindingsList findings={findings} criteria={makeCriteria()} onSelect={vi.fn()} />,
    );

    const chip = within(screen.getByTestId('finding-f-crit')).getByTestId('finding-criterion');
    expect(chip.textContent).toBe('c3');
    expect(chip.getAttribute('title')).toBe('p99 read latency stays under 200 ms');
    expect(
      within(screen.getByTestId('finding-f-low')).queryByTestId('finding-criterion'),
    ).toBeNull();
  });

  it('tags explanation findings and reconciled ones', () => {
    renderWithTheme(<FindingsList findings={findings} onSelect={vi.fn()} />);

    const claim = screen.getByTestId('finding-f-claim');
    expect(within(claim).getByTestId('finding-explanation')).toBeTruthy();
    expect(within(claim).getByTestId('finding-reconciled').textContent).toContain('c3');
    expect(
      within(screen.getByTestId('finding-f-crit')).queryByTestId('finding-explanation'),
    ).toBeNull();
  });

  it('[EVAL-2] clicking a title reports the finding — the workspace highlights its nodes and edges', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithTheme(<FindingsList findings={findings} onSelect={onSelect} />);

    await user.click(screen.getByTestId('finding-select-f-crit'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].nodeIds).toEqual(['n-3']);
  });

  it('renders an empty state for zero findings', () => {
    renderWithTheme(<FindingsList findings={[]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('findings-empty')).toBeTruthy();
  });
});
