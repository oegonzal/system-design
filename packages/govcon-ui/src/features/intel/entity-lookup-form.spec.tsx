import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { parseUeis } from './entity-lookup-form';
import * as stories from './entity-lookup-form.stories';

const { Default, Pending } = composeStories(stories);

describe('EntityLookupForm', () => {
  it('[GOVU-9] parses UEIs from free text, names the malformed ones, states the cost and looks the batch up', () => {
    const onLookup = vi.fn();
    renderWithTheme(<Default onLookup={onLookup} />);
    expect((screen.getByRole('button', { name: /Look up/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText(/UEIs/), {
      target: { value: 'abc123def456\nZZZ000000001, abc123def456 short' },
    });
    expect(screen.getByText(/Not a UEI .*: SHORT/)).toBeTruthy();
    expect(screen.getByText('2 UEI(s) ready.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Look up — 1 request (1 per 100 UEIs)' }));
    expect(onLookup).toHaveBeenCalledWith(['ABC123DEF456', 'ZZZ000000001']);
    expect(parseUeis('')).toEqual({ ueis: [], rejected: [] });
  });

  it('is disabled while a batch is in flight', () => {
    renderWithTheme(<Pending />);
    expect(
      (screen.getByRole('button', { name: 'Looking up…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
