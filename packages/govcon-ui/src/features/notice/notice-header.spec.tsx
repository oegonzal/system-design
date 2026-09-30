import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './notice-header.stories';

const { Default, SetAside } = composeStories(stories);

describe('NoticeHeader', () => {
  it('[GOVU-8] names the notice, its type, dates and activity, the agency, the codes and the way to sam.gov', () => {
    renderWithTheme(<Default />);
    expect(
      screen.getByRole('heading', { name: '59--JUNCTION BOX, IN REPAIR/MODIFICATION OF' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Solicitation · posted 2026-09-25 · deadline 2026-10-26 · active/),
    ).toBeTruthy();
    expect(screen.getByText('naics 332710')).toBeTruthy();
    expect(screen.getByText('psc 5975')).toBeTruthy();
    expect(screen.getByText('open competition')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'open on sam.gov' }).getAttribute('rel')).toBe(
      'noreferrer',
    );
  });

  it('prices the unknowns as unknown and a set-aside as a set-aside', () => {
    renderWithTheme(<SetAside />);
    expect(screen.getByText(/type unknown · posted 2026-09-25 .* activity unknown/)).toBeTruthy();
    expect(screen.getByText('set-aside SBA')).toBeTruthy();
    expect(screen.getByText(/Solicitation — · no link/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
