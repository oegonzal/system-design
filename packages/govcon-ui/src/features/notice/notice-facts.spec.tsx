import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './notice-facts.stories';

const { Default, Sparse } = composeStories(stories);

describe('NoticeFacts', () => {
  it('[GOVU-8] shows the place of performance, the contracting office and every contact with its role', () => {
    renderWithTheme(<Default />);
    expect(screen.getByText('Place of performance: Mechanicsburg, PA, 17050, USA')).toBeTruthy();
    expect(screen.getByText('Contracting office: MECHANICSBURG, PA, 17050, USA')).toBeTruthy();
    const contacts = within(screen.getByRole('list', { name: 'Contacts' })).getAllByRole(
      'listitem',
    );
    expect(contacts.map((item) => item.textContent)).toEqual([
      'primary: Noelle Smith · noelle.smith@navy.example · 717-605-3992',
    ]);
  });

  it('says what is not stated instead of showing nothing', () => {
    renderWithTheme(<Sparse />);
    expect(screen.getByText('Place of performance: not stated')).toBeTruthy();
    expect(screen.getByText('Contracting office: not stated')).toBeTruthy();
    expect(screen.getByText('No point of contact listed.')).toBeTruthy();
  });
});
