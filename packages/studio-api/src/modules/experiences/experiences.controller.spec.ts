import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ApiErrorResponse,
  GetExperienceResponse,
  ListExperiencesResponse,
} from '@sysdesign/contracts';

import { call, createHarness, type Harness } from '../../test/harness';

const TICKETING_ID = 'e1000000-0000-4000-8000-000000000001';
const UNKNOWN_UUID = '11111111-1111-4111-8111-111111111111';

describe('experiences', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  describe('GET /api/experiences', () => {
    it('lists all 5 seeded experiences with meta', async () => {
      const { status, body } = await call<ListExperiencesResponse>(`${h.url}/experiences`);

      expect(status).toBe(200);
      expect(body.data).toHaveLength(5);
      expect(body.meta.total).toBe(5);
      expect(body.data[0]?.id).toBe(TICKETING_ID);
      expect(body.data.map((e) => e.archetype)).toEqual([
        'flash-sale-ticketing',
        'media-streaming-pipeline',
        'workflow-automation',
        'realtime-analytics',
        'dag-orchestration',
      ]);
      expect(body.data[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO, not a Date
    });
  });

  describe('GET /api/experiences/:id', () => {
    it('returns one experience by its fixture uuid', async () => {
      const { status, body } = await call<GetExperienceResponse>(
        `${h.url}/experiences/${TICKETING_ID}`,
      );

      expect(status).toBe(200);
      expect(body.data.slug).toBe('ticketing-replatform');
      expect(body.data.scaleFacts.concurrentUsers).toBe(10000);
    });

    it('400s for a malformed id, before any query runs', async () => {
      const { status } = await call<ApiErrorResponse>(`${h.url}/experiences/not-a-uuid`);
      expect(status).toBe(400);
    });

    it('404s for a well-formed but unknown id', async () => {
      const { status } = await call<ApiErrorResponse>(`${h.url}/experiences/${UNKNOWN_UUID}`);
      expect(status).toBe(404);
    });
  });
});
