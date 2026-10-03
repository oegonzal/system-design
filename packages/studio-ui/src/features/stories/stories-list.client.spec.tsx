import { DEFAULT_LIST_LIMIT, STORY_SECTION_BOUND, STORY_TAG_BOUND } from '@sysdesign/contracts';
import type * as WebTesting from '@sysdesign/web-testing';
import { renderWithTheme, resetNavigationMock, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeStory } from '../../testing/fixtures';
import { StoriesList } from './stories-list.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

beforeEach(() => {
  resetNavigationMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** `total` stories on the server, paged as the client asks; `fail` answers the next ask with an outage. */
function storiesServer(total: number) {
  const state = { fail: false };
  const route = {
    path: '/api/star-stories',
    handler: ({ url }: { url: URL }) => {
      if (state.fail) return { status: 503, body: { statusCode: 503, message: 'Down for now' } };
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset'));
      const count = Math.max(0, Math.min(limit, total - offset));
      const data = Array.from({ length: count }, (_, i) =>
        makeStory({ id: `story-${offset + i}`, title: `Story ${offset + i}` }),
      );
      return { body: { data, meta: { total, limit, offset } } };
    },
  };
  return { state, route };
}

describe('StoriesList', () => {
  it('[STAR-2] pages through every story — none past the first page is out of reach', async () => {
    const user = userEvent.setup();
    const total = DEFAULT_LIST_LIMIT + 2;
    stubApi([storiesServer(total).route]);
    renderWithTheme(<StoriesList />);

    const list = await screen.findByTestId('story-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(DEFAULT_LIST_LIMIT);
    const more = screen.getByTestId('more-stories');
    expect(more.textContent).toBe(`Load more (${DEFAULT_LIST_LIMIT} of ${total})`);
    await user.click(more);
    await waitFor(() =>
      expect(within(screen.getByTestId('story-list')).getAllByRole('listitem')).toHaveLength(total),
    );
    expect(screen.queryByTestId('more-stories')).toBeNull();
  });

  it('[STAR-2] shows a failed filter’s error in place of the rows — never the last filter’s — with a Retry', async () => {
    const user = userEvent.setup();
    const server = storiesServer(3);
    stubApi([server.route]);
    renderWithTheme(<StoriesList />);
    expect(await screen.findByTestId('story-list')).toBeTruthy();

    server.state.fail = true;
    await user.type(screen.getByTestId('story-tag-filter'), 'caching');
    const failure = await screen.findByTestId('stories-error');
    expect(failure.textContent).toContain('Down for now');
    expect(screen.queryByTestId('story-list')).toBeNull();

    server.state.fail = false;
    await user.click(within(failure).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('story-list')).toBeTruthy();
  });

  it('[STAR-2] bounds its filters as the API bounds them', async () => {
    stubApi([storiesServer(0).route]);
    renderWithTheme(<StoriesList />);

    expect(await screen.findByText(/No stories yet/)).toBeTruthy();
    expect((screen.getByTestId('story-search') as HTMLInputElement).maxLength).toBe(
      STORY_SECTION_BOUND.target,
    );
    expect((screen.getByTestId('story-tag-filter') as HTMLInputElement).maxLength).toBe(
      STORY_TAG_BOUND.target,
    );
  });
});
