import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PROFILE } from '../../testing/fixtures';
import * as stories from './scoring-sections.stories';

const { Default, OffBalance, Disabled } = composeStories(stories);

describe('ScoringSections', () => {
  it('[GOVU-10] sums the weights live and says when they miss 1, hands back only the part of the policy that changed, and waits while a save is in flight', () => {
    const onChange = vi.fn();
    const balanced = renderWithTheme(<Default onChange={onChange} />);
    expect(screen.getByRole('status').textContent).toBe('Weights sum to 1.00');

    fireEvent.change(screen.getByLabelText('Weight naics'), { target: { value: '0.5' } });
    expect(onChange).toHaveBeenLastCalledWith({
      weights: { ...PROFILE.scoring.weights, naics: 0.5 },
    });
    fireEvent.change(screen.getByLabelText('Open competition'), { target: { value: '0.4' } });
    expect(onChange).toHaveBeenLastCalledWith({
      setAside: { ...PROFILE.scoring.setAside, unrestricted: 0.4 },
    });
    fireEvent.change(screen.getByLabelText('History window days'), { target: { value: '180' } });
    expect(onChange).toHaveBeenLastCalledWith({
      history: { ...PROFILE.scoring.history, days: 180 },
    });
    balanced.unmount();

    const off = renderWithTheme(<OffBalance />);
    expect(screen.getByText('Weights sum to 1.20 — they must sum to 1').getAttribute('role')).toBe(
      'alert',
    );
    // The service's own word sits beside the weights it names.
    expect(document.querySelector('[data-path="scoring.weights"]')?.textContent).toBe(
      'weights sum to 1.2, not 1',
    );
    off.unmount();

    renderWithTheme(<Disabled />);
    expect((screen.getByLabelText('Weight naics') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Awards for a full point') as HTMLInputElement).disabled).toBe(
      true,
    );
  });
});
