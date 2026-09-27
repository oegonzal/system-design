import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import { clampDays } from './pull-controls';
import * as stories from './pull-controls.stories';

const { Default, Pulling, SourceDisabled } = composeStories(stories);

describe('PullControls', () => {
  it('[GOVU-1] offers the profiles and a window in days, and reports each change and the pull', () => {
    const onChange = fn();
    const onPull = fn();
    renderWithTheme(<Default onChange={onChange} onPull={onPull} />);
    expect(screen.getByRole('option', { name: 'Enfav LLC (enfav)' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Posted in the last N days'), {
      target: { value: '7' },
    });
    expect(onChange).toHaveBeenCalledWith({ profileId: 'enfav', days: 7 });

    fireEvent.click(screen.getByRole('button', { name: 'Pull' }));
    expect(onPull).toHaveBeenCalledTimes(1);
  });

  it('[GOVU-1] keeps the button off while pulling and when the source is disabled, naming the reason', () => {
    renderWithTheme(<Pulling />);
    expect((screen.getByRole('button', { name: 'Pulling…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    renderWithTheme(<SourceDisabled />);
    expect((screen.getByRole('button', { name: 'Pull' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/SAM_GOV_API_KEY is not set/)).toBeTruthy();
  });

  it('clamps the window to what the source accepts', () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(2.6)).toBe(3);
    expect(clampDays(1000)).toBe(366);
    expect(clampDays(Number.NaN)).toBe(1);
  });
});
