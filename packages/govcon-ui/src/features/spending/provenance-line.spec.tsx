import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './provenance-line.stories';

const { Default, Stale, Bare } = composeStories(stories);

describe('ProvenanceLine', () => {
  it('[GOVU-11] states the source, its as-of, where the answer was served from, what it cost and when, and the disclosures verbatim', () => {
    renderWithTheme(<Default />);
    expect(
      screen.getByText(
        'usaspending · data as of 2026-06-14 · from the day’s snapshot · 1 request(s) · fetched 2026-06-15 13:00',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Department of Defense awards are published 90 days after they are signed.'),
    ).toBeTruthy();
    expect(screen.queryByText(/did not complete/)).toBeNull();
  });

  it('warns when the answer is stale, and says nothing extra for a bare source', () => {
    renderWithTheme(<Stale />);
    expect(screen.getByText(/did not complete/)).toBeTruthy();
    expect(screen.getByText(/the source refused a refresh/)).toBeTruthy();
    renderWithTheme(<Bare />);
    expect(screen.getByText(/data as of —/)).toBeTruthy();
  });
});
