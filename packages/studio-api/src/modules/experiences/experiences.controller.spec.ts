import { describe, expect, it } from 'vitest';
import type {
  ApiErrorResponse,
  GetExperienceResponse,
  ListExperiencesResponse,
} from '@sysdesign/contracts';

import { call, TICKETING_ID, UNKNOWN_UUID, useHarness } from '../../test/harness';

describe('experiences', () => {
  const h = useHarness();

  describe('GET /api/experiences', () => {
    it('lists all 6 seeded experiences with meta', async () => {
      const { status, body } = await call<ListExperiencesResponse>(`${h.url}/experiences`);

      expect(status).toBe(200);
      expect(body.data).toHaveLength(6);
      expect(body.meta.total).toBe(6);
      expect(body.data[0]?.id).toBe(TICKETING_ID);
      expect(body.data.map((e) => e.slug)).toEqual([
        'ticketing-replatform',
        'media-collectibles-platform',
        'adtech-workflow-automation',
        'network-risk-dashboards',
        'agentic-dag-engine',
        'retail-order-history',
      ]);
      expect(body.data[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO, not a Date
      expect(body.meta).toEqual({ total: 6, limit: 50, offset: 0 });
    });

    it('pages like every list: the meta reports the page it applied, and bounds are validated', async () => {
      const { body } = await call<ListExperiencesResponse>(`${h.url}/experiences?limit=2&offset=1`);
      expect(body.meta).toEqual({ total: 6, limit: 2, offset: 1 });
      expect(body.data.map((e) => e.slug)).toEqual([
        'media-collectibles-platform',
        'adtech-workflow-automation',
      ]);

      expect((await call(`${h.url}/experiences?limit=101`)).status).toBe(400);
      expect((await call(`${h.url}/experiences?limit=0`)).status).toBe(400);
      expect((await call(`${h.url}/experiences?sort=title`)).status).toBe(400);
    });
  });

  describe('GET /api/experiences/:id', () => {
    it('returns one experience by its fixture uuid', async () => {
      const { status, body } = await call<GetExperienceResponse>(
        `${h.url}/experiences/${TICKETING_ID}`,
      );

      expect(status).toBe(200);
      expect(body.data.slug).toBe('ticketing-replatform');
      // The numbers a prompt is sized from live in the prose, not in fields.
      expect(body.data.highlights.join(' ')).toContain('10,000+ concurrent');
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
