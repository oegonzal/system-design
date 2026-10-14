import { describe, expect, it } from 'vitest';
import {
  STORY_TAG_BOUND,
  type ApiErrorResponse,
  type GetPromptResponse,
  type GetStarStoryResponse,
  type ListStarStoriesResponse,
  type SaveStarStoryRequest,
} from '@sysdesign/contracts';

import { call, TICKETING_ID, UNKNOWN_UUID, useHarness } from '../../test/harness';

const storyRequest = (overrides: Partial<SaveStarStoryRequest> = {}): SaveStarStoryRequest => ({
  title: 'Scaled the on-sale reservation path',
  situation: 'On-sales spiked to ten thousand concurrent buyers and checkouts timed out',
  task: 'Keep the reservation path responsive through the opening minute',
  action: 'Introduced a fair queue and moved side-effects onto transactional events',
  result: 'The next on-sale sold out with zero oversell and no timeouts',
  tags: ['scaling', 'postgres'],
  ...overrides,
});

describe('star stories', () => {
  const h = useHarness();

  const createStory = async (body: SaveStarStoryRequest) =>
    call<GetStarStoryResponse>(`${h.url}/star-stories`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  describe('CRUD', () => {
    it('[STAR-1] creates, reads, replaces and deletes a story', async () => {
      const { status, body } = await createStory(storyRequest());
      expect(status).toBe(201);
      expect(body.data.title).toBe('Scaled the on-sale reservation path');
      expect(body.data.tags).toEqual(['scaling', 'postgres']);
      expect(body.data.promptId).toBeNull();
      expect(body.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const id = body.data.id;
      const fetched = await call<GetStarStoryResponse>(`${h.url}/star-stories/${id}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body.data).toEqual(body.data);

      // PUT is a full replace: every field takes the new value.
      const replaced = await call<GetStarStoryResponse>(`${h.url}/star-stories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(
          storyRequest({
            title: 'Rebuilt the reservation path',
            result: 'Cut p99 checkout latency in half',
            tags: ['latency'],
          }),
        ),
      });
      expect(replaced.status).toBe(200);
      expect(replaced.body.data.title).toBe('Rebuilt the reservation path');
      expect(replaced.body.data.result).toBe('Cut p99 checkout latency in half');
      expect(replaced.body.data.tags).toEqual(['latency']);

      const deleted = await call(`${h.url}/star-stories/${id}`, { method: 'DELETE' });
      expect(deleted.status).toBe(204);
      expect((await call(`${h.url}/star-stories/${id}`)).status).toBe(404);
    });

    it('rejects a duplicate title with 409, not a 500', async () => {
      await createStory(storyRequest());
      const { status } = await createStory(storyRequest({ situation: 'different situation' }));
      expect(status).toBe(409);
    });

    it('[STAR-1] refuses a blank title or section and an oversized tag with every path, and stores what it keeps trimmed', async () => {
      const empty = await call<ApiErrorResponse>(`${h.url}/star-stories`, {
        method: 'POST',
        body: JSON.stringify(
          storyRequest({
            situation: '',
            task: '  ',
            action: '',
            result: '\n',
            tags: ['ok', 'x'.repeat(STORY_TAG_BOUND.ceiling + 1)],
          }),
        ),
      });
      expect(empty.status).toBe(400);
      expect(empty.body.issues?.map((issue) => issue.path)).toEqual([
        'situation',
        'task',
        'action',
        'result',
        'tags.1',
      ]);
      const list = await call<ListStarStoriesResponse>(`${h.url}/star-stories`);
      expect(list.body.meta.total).toBe(0);

      const { status, body } = await createStory(
        storyRequest({ title: '  Padded title  ', tags: [' scaling '] }),
      );
      expect(status).toBe(201);
      expect(body.data).toMatchObject({ title: 'Padded title', tags: ['scaling'] });

      const blanked = await call(`${h.url}/star-stories/${body.data.id}`, {
        method: 'PUT',
        body: JSON.stringify(storyRequest({ title: '   ' })),
      });
      expect(blanked.status).toBe(400);
    });

    it('rejects an undeclared body property', async () => {
      const { status } = await call(`${h.url}/star-stories`, {
        method: 'POST',
        body: JSON.stringify({ ...storyRequest(), isPublic: true }),
      });
      expect(status).toBe(400);
    });
  });

  describe('GET /api/star-stories', () => {
    it('[STAR-2] searches across situation text and filters by exact tag', async () => {
      await createStory(storyRequest());
      await createStory(
        storyRequest({
          title: 'Untangled the media pipeline',
          situation: 'Transcode backlog grew unbounded during launch drops',
          tags: ['media', 'postgres-tuning'],
        }),
      );

      // Case-insensitive contains over situation.
      const bySituation = await call<ListStarStoriesResponse>(
        `${h.url}/star-stories?search=TRANSCODE%20backlog`,
      );
      expect(bySituation.body.meta.total).toBe(1);
      expect(bySituation.body.data[0]?.title).toBe('Untangled the media pipeline');

      // Exact tag membership: 'postgres' must not match 'postgres-tuning'.
      const byTag = await call<ListStarStoriesResponse>(`${h.url}/star-stories?tag=postgres`);
      expect(byTag.body.meta.total).toBe(1);
      expect(byTag.body.data[0]?.title).toBe('Scaled the on-sale reservation path');
    });

    it('[STAR-2] filters by a tag written past the ask and up to the ceiling, and refuses a term no stored tag can match', async () => {
      const long = 't'.repeat(STORY_TAG_BOUND.ceiling);
      await createStory(storyRequest({ title: 'Tagged at the ceiling', tags: [long] }));

      const byLong = await call<ListStarStoriesResponse>(`${h.url}/star-stories?tag=${long}`);
      expect(byLong.body.data.map((story) => story.title)).toEqual(['Tagged at the ceiling']);
      const past = await call<ApiErrorResponse>(`${h.url}/star-stories?tag=${long}t`);
      expect(past.status).toBe(400);
      expect(past.body.issues?.map((issue) => issue.path)).toEqual(['tag']);
    });

    it('reports the filtered total for the pager', async () => {
      await createStory(storyRequest());
      await createStory(storyRequest({ title: 'A second story' }));

      const { body } = await call<ListStarStoriesResponse>(`${h.url}/star-stories?search=second`);
      expect(body.meta).toEqual({ total: 1, limit: 50, offset: 0 });
    });
  });

  describe('links', () => {
    it('[STAR-3] links a story to a prompt and an experience, echoed in the DTO', async () => {
      const { body: prompt } = await call<GetPromptResponse>(`${h.url}/prompts`, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Serve an order history',
          markdown: '# Serve an order history\n\n- list past orders',
          experienceId: TICKETING_ID,
        }),
      });

      const { status, body } = await createStory(
        storyRequest({ promptId: prompt.data.id, experienceId: TICKETING_ID }),
      );

      expect(status).toBe(201);
      expect(body.data.promptId).toBe(prompt.data.id);
      expect(body.data.experienceId).toBe(TICKETING_ID);

      // Filterable by both links.
      const byPrompt = await call<ListStarStoriesResponse>(
        `${h.url}/star-stories?promptId=${prompt.data.id}`,
      );
      expect(byPrompt.body.meta.total).toBe(1);
    });

    it('rejects an unknown promptId with 422 — well-formed but unsatisfiable', async () => {
      const { status, body } = await call<ApiErrorResponse>(`${h.url}/star-stories`, {
        method: 'POST',
        body: JSON.stringify(storyRequest({ promptId: UNKNOWN_UUID })),
      });

      expect(status).toBe(422);
      expect(JSON.stringify(body.message)).toContain(UNKNOWN_UUID);
    });
  });
});
