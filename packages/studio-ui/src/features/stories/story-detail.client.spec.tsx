import type * as WebTesting from '@sysdesign/web-testing';
import { renderWithTheme, resetNavigationMock, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeStory } from '../../testing/fixtures';
import { StoryDetail } from './story-detail.client';

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

const LINK_OPTIONS = [
  { path: '/api/prompts', body: { data: [], meta: { total: 0, limit: 50, offset: 0 } } },
  { path: '/api/experiences', body: { data: [], meta: { total: 0, limit: 50, offset: 0 } } },
];

const leaving = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('StoryDetail', () => {
  it('[STAR-1] saves in place: "Saved" beside the actions, announced every time, and a guard only while edits are unsaved', async () => {
    const user = userEvent.setup();
    let version = 0;
    stubApi([
      ...LINK_OPTIONS,
      { path: '/api/star-stories/story-1', body: { data: makeStory() } },
      {
        method: 'PUT',
        path: '/api/star-stories/story-1',
        handler: ({ init }) => {
          version += 1;
          const sent = JSON.parse(String(init?.body)) as { title: string };
          return {
            body: {
              data: makeStory({
                title: sent.title,
                updatedAt: `2026-08-21T00:00:0${version}.000Z`,
              }),
            },
          };
        },
      },
    ]);
    renderWithTheme(<StoryDetail storyId="story-1" />);

    const title = await screen.findByLabelText('Title');
    expect(leaving()).toBe(false);
    await user.type(title, ' again');
    expect(leaving()).toBe(true);
    await user.click(screen.getByTestId('save-story'));

    expect(await screen.findByTestId('story-saved')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Story saved.');
    // The saved story is a fresh form with nothing unsaved; the guard lets go.
    await waitFor(() => expect(leaving()).toBe(false));
    await waitFor(() =>
      expect(document.title).toBe(
        'The replica that saved the on-sale again · System Design Studio',
      ),
    );

    // The same words a second time are still a change the region announces.
    const region = screen.getByRole('status');
    const heard: string[] = [];
    const observer = new MutationObserver(() => heard.push(region.textContent ?? ''));
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    await user.type(screen.getByLabelText('Title'), '!');
    await user.click(screen.getByTestId('save-story'));
    await waitFor(() => expect(heard).toEqual(['', 'Story saved.']));
    observer.disconnect();
  });

  it('[STAR-1] a save that stores nothing new still lands: the fields show what was stored, "Saved" shows, and the guard lets go', async () => {
    const user = userEvent.setup();
    const stored = makeStory();
    const puts: unknown[] = [];
    stubApi([
      ...LINK_OPTIONS,
      { path: '/api/star-stories/story-1', body: { data: stored } },
      {
        method: 'PUT',
        path: '/api/star-stories/story-1',
        handler: ({ init }) => {
          puts.push(JSON.parse(String(init?.body)));
          // Trimmed, the request is the stored story: nothing is written, updatedAt stands.
          return { body: { data: stored } };
        },
      },
    ]);
    renderWithTheme(<StoryDetail storyId="story-1" />);

    await user.type(await screen.findByLabelText('Result'), '   ');
    // Spaces the save rule trims are not unsaved edits.
    expect(leaving()).toBe(false);
    await user.click(screen.getByTestId('save-story'));

    expect(await screen.findByTestId('story-saved')).toBeTruthy();
    expect(puts).toHaveLength(1);
    expect((screen.getByLabelText('Result') as HTMLTextAreaElement).value).toBe(stored.result);
    expect(leaving()).toBe(false);
  });

  it('[STAR-1] tells a refused save beside Save, as an alert', async () => {
    const user = userEvent.setup();
    stubApi([
      ...LINK_OPTIONS,
      { path: '/api/star-stories/story-1', body: { data: makeStory() } },
      {
        method: 'PUT',
        path: '/api/star-stories/story-1',
        status: 409,
        body: { statusCode: 409, message: 'A story with that title already exists' },
      },
    ]);
    renderWithTheme(<StoryDetail storyId="story-1" />);

    await user.type(await screen.findByLabelText('Title'), '!');
    await user.click(screen.getByTestId('save-story'));

    expect((await screen.findByTestId('story-save-error')).textContent).toBe(
      'A story with that title already exists',
    );
    expect(screen.getByRole('alert')).toBe(screen.getByTestId('story-save-error'));
  });

  it('names the tab after the story, and keeps it named when the route’s own title lands late', async () => {
    stubApi([...LINK_OPTIONS, { path: '/api/star-stories/story-1', body: { data: makeStory() } }]);
    renderWithTheme(<StoryDetail storyId="story-1" />);

    const named = 'The replica that saved the on-sale · System Design Studio';
    await waitFor(() => expect(document.title).toBe(named));
    // The race a direct load can lose: the story arrived first, the route's metadata second.
    const routeTitle = document.querySelector('title') as HTMLTitleElement;
    routeTitle.textContent = 'STAR story · System Design Studio';
    await waitFor(() => expect(document.title).toBe(named));
  });

  it('[UX-12] calls a missing or malformed story not found, with the way back to the stories', async () => {
    stubApi([
      ...LINK_OPTIONS,
      {
        path: '/api/star-stories/not-a-uuid',
        status: 400,
        body: { statusCode: 400, message: 'Validation failed (uuid is expected)' },
      },
    ]);
    renderWithTheme(<StoryDetail storyId="not-a-uuid" />);

    expect(await screen.findByRole('heading', { name: 'STAR story not found' })).toBeTruthy();
    expect(screen.queryByText(/uuid is expected/)).toBeNull();
    expect(screen.queryByTestId('notice-retry')).toBeNull();
    const back = screen.getByTestId('notice-back');
    expect(back.getAttribute('href')).toBe('/stories');
    expect(back.textContent).toBe('Back to your stories');
  });

  it('[UX-12] offers a Retry for a load that failed, never calling the story missing', async () => {
    const user = userEvent.setup();
    let down = true;
    stubApi([
      ...LINK_OPTIONS,
      {
        path: '/api/star-stories/story-1',
        handler: () =>
          down
            ? { status: 500, body: { statusCode: 500, message: 'Internal server error' } }
            : { body: { data: makeStory() } },
      },
    ]);
    renderWithTheme(<StoryDetail storyId="story-1" />);

    expect(
      await screen.findByRole('heading', { name: "Couldn't load this STAR story" }),
    ).toBeTruthy();
    down = false;
    await user.click(screen.getByTestId('notice-retry'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'The replica that saved the on-sale' }),
    ).toBeTruthy();
  });
});
