import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeAxis, makeScenarioReport } from '../../testing/fixtures';
import { renderWithTheme } from '../../testing/render';
import { LlmInsights } from './llm-insights';

describe('LlmInsights', () => {
  it('renders nothing when there is no advisory material', () => {
    const { container } = renderWithTheme(<LlmInsights axes={[]} scenarios={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('[EVAL-6] shows the depth axis as advisory, beside the grade', () => {
    renderWithTheme(<LlmInsights axes={[makeAxis()]} scenarios={[]} />);
    expect(screen.getByTestId('axis-depth')).toBeTruthy();
    expect(screen.getByText('Depth & justification')).toBeTruthy();
    expect(screen.getByText('AI-assessed — does not affect the grade.')).toBeTruthy();
    expect(screen.getByText('Mechanisms are named but capacities are defaulted.')).toBeTruthy();
    // The headline meter carries the axis score.
    const meters = screen.getAllByRole('meter');
    expect(meters[0].getAttribute('aria-valuenow')).toBe('61');
  });

  it('renders the narrative & alignment axis through the generic axis path', () => {
    renderWithTheme(
      <LlmInsights
        axes={[
          makeAxis({
            id: 'narrative',
            label: 'Narrative & alignment',
            score: 82,
            subScores: null,
            summary: 'The prose and the diagram tell the same story.',
          }),
        ]}
        scenarios={[]}
      />,
    );
    expect(screen.getByTestId('axis-narrative')).toBeTruthy();
    expect(screen.getByText('Narrative & alignment')).toBeTruthy();
    expect(screen.getByText('The prose and the diagram tell the same story.')).toBeTruthy();
  });

  it('explains an unscored axis instead of showing an empty meter', () => {
    renderWithTheme(
      <LlmInsights
        axes={[makeAxis({ score: null, subScores: null, summary: null })]}
        scenarios={[]}
      />,
    );
    expect(screen.getByText('Not scored — the model critic was unavailable.')).toBeTruthy();
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
  });

  it('[EVAL-7] narrates scenario reports with their verdicts', () => {
    renderWithTheme(
      <LlmInsights
        axes={[]}
        scenarios={[
          makeScenarioReport(),
          makeScenarioReport({
            scenarioId: 'region-loss',
            title: 'A region disappears',
            verdict: 'fails',
            story: 'Everything in the region goes with it.',
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('scenario-reports')).toBeTruthy();
    expect(screen.getByTestId('scenario-thundering-herd').textContent).toContain('degrades');
    expect(screen.getByTestId('scenario-region-loss').textContent).toContain('fails');
    expect(screen.getByText('Everything in the region goes with it.')).toBeTruthy();
  });
});
