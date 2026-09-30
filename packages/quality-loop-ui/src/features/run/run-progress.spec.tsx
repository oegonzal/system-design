import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatElapsed } from './run-progress';
import * as stories from './run-progress.stories';

const { Running, Complete, ModelFailed, Failed } = composeStories(stories);

describe('RunProgress', () => {
  it('[QLU-2] shows the status, the elapsed time and one row per attributed exchange', () => {
    renderWithTheme(<Complete />);

    expect(screen.getByText('complete')).toBeTruthy();
    expect(screen.getByTestId('elapsed').textContent).toBe('5:17');
    expect(screen.getByText('Model: test-model')).toBeTruthy();
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(1 + 4);
    expect(rows[1]?.textContent).toContain('criteria');
    expect(rows[4]?.textContent).toContain('evaluator.requirements.s1');
  });

  it('[QLU-2] keeps counting while the run is live and spins', () => {
    renderWithTheme(<Running />);

    expect(screen.getByText('running')).toBeTruthy();
    expect(screen.getByText('Run in progress')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(1 + 2);
  });

  it('names the model behind an escalated run, and what a failed run died of', () => {
    const { unmount } = renderWithTheme(<ModelFailed />);
    expect(screen.getByText(/Model: test-model/)).toBeTruthy();
    expect(screen.getByText('No model exchanges yet.')).toBeTruthy();
    unmount();

    renderWithTheme(<Failed />);
    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.getByText(/the producer returned malformed JSON/)).toBeTruthy();
  });

  it('formats elapsed time as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_400)).toBe('1:05');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});
