import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { fn } from 'storybook/test';
import { describe, expect, it } from 'vitest';

import * as stories from './lead-filters.stories';

const { Default, HighOnly } = composeStories(stories);

describe('LeadFilters', () => {
  it('[GOVU-2] reports the score floor, the tier and the cap, clamped to what the service accepts', () => {
    const onChange = fn();
    renderWithTheme(<Default onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '150' } });
    expect(onChange).toHaveBeenLastCalledWith({ minScore: 100, tier: null, limit: 25 });
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'medium' } });
    expect(onChange).toHaveBeenLastCalledWith({ minScore: 40, tier: 'medium', limit: 25 });
    fireEvent.change(screen.getByLabelText('Show up to'), { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith({ minScore: 40, tier: null, limit: 1 });
  });

  it('shows the chosen tier and lets it go back to any', () => {
    const onChange = fn();
    renderWithTheme(<HighOnly onChange={onChange} />);
    expect((screen.getByLabelText('Tier') as HTMLSelectElement).value).toBe('high');
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'any' } });
    expect(onChange).toHaveBeenLastCalledWith({ minScore: 0, tier: null, limit: 10 });
  });
});
