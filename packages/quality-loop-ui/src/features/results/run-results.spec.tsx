import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './run-results.stories';

const { Revised, Escalated, TwoIterations, Running } = composeStories(stories);

describe('RunResults', () => {
  it('[QLU-3] renders the decision, gates, scores, criteria, findings, remediations and the artifact', () => {
    renderWithTheme(<Revised />);

    expect(screen.getAllByText('revise').length).toBeGreaterThan(0);
    expect(screen.getByText(/stopped: max-iterations/)).toBeTruthy();
    expect(screen.getByText(/overall 65.2 is below acceptAt 80/)).toBeTruthy();

    const gates = within(screen.getByLabelText('Gates'));
    expect(gates.getAllByText(/: yes$/)).toHaveLength(4);

    const meters = screen.getAllByRole('meter');
    expect(meters.map((meter) => meter.getAttribute('aria-valuenow'))).toEqual(['65', '50', '88']);
    expect(screen.getByText('−12 from findings')).toBeTruthy();

    const criteria = within(screen.getByLabelText('Criteria'));
    expect(criteria.getAllByRole('row')).toHaveLength(1 + 2);
    expect(criteria.getByText(/one Order History list/)).toBeTruthy();
    expect(criteria.getByText('fail')).toBeTruthy();

    expect(screen.getByText('high (1)')).toBeTruthy();
    expect(screen.getByText('medium (1)')).toBeTruthy();
    expect(screen.getByText(/charged through c2/)).toBeTruthy();
    expect(screen.getByText(/revise: The summary promises sub-second freshness/)).toBeTruthy();
    expect(screen.getByText('Not selected for remediation.')).toBeTruthy();
    expect(screen.getByText('criterion c2')).toBeTruthy();

    expect(screen.getByText('route')).toBeTruthy();
    expect(screen.getByText('revise: 2 remediations')).toBeTruthy();
    expect(screen.getByLabelText('Rendered artifact').textContent).toContain(
      '[component.2] Sync worker',
    );
  });

  it('[QLU-3] shows an escalation honestly: closed gates, nothing assessed, the diagnostics, no artifact', () => {
    renderWithTheme(<Escalated />);

    expect(screen.getAllByText('escalate').length).toBeGreaterThan(0);
    const gates = within(screen.getByLabelText('Gates'));
    expect(gates.getByText('artifactPresent: no')).toBeTruthy();
    expect(screen.getByText('completeness: not assessed')).toBeTruthy();
    expect(screen.getByText('No criteria were derived.')).toBeTruthy();
    expect(screen.getAllByText(/llm-failed/)).toHaveLength(2);
    expect(screen.getByLabelText('Rendered artifact').textContent).toBe(
      'No artifact was produced.',
    );
  });

  it('opens on the best iteration, switches tabs, and lists the lessons', () => {
    renderWithTheme(<TwoIterations />);

    expect(screen.getByText(/best iteration 2 of 2/)).toBeTruthy();
    expect(screen.getByText('resolved')).toBeTruthy();
    expect(screen.getByText(/fail → pass/)).toBeTruthy();
    expect(screen.getByText(/overall 100 reaches acceptAt 80/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Iteration 1/ }));
    expect(screen.getByText(/overall 65.2 is below acceptAt 80/)).toBeTruthy();
  });

  it('[QLU-2] a run still going shows the iterations finished so far as its standing, never a stop', () => {
    renderWithTheme(<Running />);

    expect(screen.getByText(/still running · best so far iteration 1 of 1 finished/)).toBeTruthy();
    expect(screen.queryByText(/stopped:/)).toBeNull();
    expect(screen.getByRole('tab', { name: /Iteration 1/ })).toBeTruthy();
  });
});
