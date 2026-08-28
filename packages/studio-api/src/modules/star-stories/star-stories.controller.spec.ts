import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ApiErrorResponse,
  GetPromptResponse,
  GetStarStoryResponse,
  ListStarStoriesResponse,
  SaveStarStoryRequest,
} from '@sysdesign/contracts';

import { call, createHarness, resetDesignData, type Harness } from '../../test/harness';

const TICKETING_ID = 'e1000000-0000-4000-8000-000000000001';
const UNKNOWN_UUID = '11111111-1111-4111-8111-111111111111';

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
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await resetDesignData(h.em);
  });

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

    it('reports the filtered total for the pager', async () => {
      await createStory(storyRequest());
      await createStory(storyRequest({ title: 'A second story' }));

      const { body } = await call<ListStarStoriesResponse>(`${h.url}/star-stories?search=second`);
      expect(body.meta).toEqual({ total: 1, limit: 50, offset: 0 });
    });
  });

  describe('links', () => {
    it('[STAR-3] links a story to a prompt and an experience, echoed in the DTO', async () => {
      const { body: prompt } = await call<GetPromptResponse>(`${h.url}/prompts/generate`, {
        method: 'POST',
        body: JSON.stringify({ experienceId: TICKETING_ID }),
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
