import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './attachment-list.stories';

const { Default, None } = composeStories(stories);

describe('AttachmentList', () => {
  it('[GOVU-8] links every attachment in order, straight to sam.gov in a new tab, and says nothing is spent', () => {
    renderWithTheme(<Default />);
    const links = within(screen.getByRole('list', { name: 'Attachments' })).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Attachment 1', 'Attachment 2']);
    expect(links[0]?.getAttribute('href')).toContain(
      '/resources/files/c30288c45b7b4fb39e647a2eab150983/download',
    );
    expect(links[0]?.getAttribute('href')).not.toContain('api_key');
    expect(links[0]?.getAttribute('target')).toBe('_blank');
    expect(links[0]?.getAttribute('rel')).toBe('noreferrer');
    expect(screen.getByText(/spends nothing, and needs no key/)).toBeTruthy();
  });

  it('says when there are none', () => {
    renderWithTheme(<None />);
    expect(screen.getByText('No attachments on this notice.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
