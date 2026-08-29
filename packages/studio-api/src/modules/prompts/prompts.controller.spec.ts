import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ApiErrorResponse,
  GeneratePromptRequest,
  GetPromptResponse,
  ListPromptsResponse,
} from '@sysdesign/contracts';

import { call, createHarness, resetDesignData, type Harness } from '../../test/harness';

const TICKETING_ID = 'e1000000-0000-4000-8000-000000000001';
const MEDIA_ID = 'e1000000-0000-4000-8000-000000000002';
const UNKNOWN_UUID = '11111111-1111-4111-8111-111111111111';

describe('prompts', () => {
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

  const generate = async (body: GeneratePromptRequest | Record<string, unknown>) =>
    call<GetPromptResponse>(`${h.url}/prompts/generate`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  describe('POST /api/prompts/generate', () => {
    it('[GEN-1] generates a prompt from an experience and persists it', async () => {
      const { status, body } = await generate({ experienceId: TICKETING_ID });

      expect(status).toBe(201);
      expect(body.data.experienceId).toBe(TICKETING_ID);
      expect(body.data.archetype).toBe('flash-sale-ticketing');
      expect(body.data.difficulty).toBe('standard'); // the default
      expect(body.data.status).toBe('active');
      expect(body.data.llmEnriched).toBe(false);
      expect(body.data.generatorVersion).toBe('2.0.0');
      expect(body.data.seed).toBeGreaterThanOrEqual(0);

      // Persisted: fetchable through the read endpoint with identical content.
      const fetched = await call<GetPromptResponse>(`${h.url}/prompts/${body.data.id}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body.data).toEqual(body.data);
    });

    it('[GEN-2] generates identical content for the same explicit seed', async () => {
      const first = await generate({ experienceId: TICKETING_ID, seed: 42 });
      const second = await generate({ experienceId: TICKETING_ID, seed: 42 });

      expect(second.body.data.title).toBe(first.body.data.title);
      expect(second.body.data.scenario).toBe(first.body.data.scenario);
      expect(second.body.data.functionalRequirements).toEqual(
        first.body.data.functionalRequirements,
      );
      expect(second.body.data.nonFunctionalRequirements).toEqual(
        first.body.data.nonFunctionalRequirements,
      );
      expect(second.body.data.scaleTargets).toEqual(first.body.data.scaleTargets);
    });

    it('[GEN-3] carries scenario, requirements and scale targets in the response', async () => {
      const { body } = await generate({ experienceId: TICKETING_ID, difficulty: 'advanced' });

      expect(body.data.scenario.length).toBeGreaterThan(100);
      expect(body.data.functionalRequirements.length).toBeGreaterThanOrEqual(4);
      expect(body.data.functionalRequirements.length).toBeLessThanOrEqual(6);
      expect(body.data.nonFunctionalRequirements.length).toBeGreaterThanOrEqual(3);
      expect(body.data.nonFunctionalRequirements.length).toBeLessThanOrEqual(5);

      const kinds = body.data.nonFunctionalRequirements.map((n) => n.kind);
      expect(kinds).toContain('latency');
      expect(kinds).toContain('availability');

      // advanced = intro ×100; the fixture states 10,000 concurrent users.
      expect(body.data.scaleTargets.concurrentUsers).toBe(1000000);
    });

    it('rejects an unknown experience with 422 — well-formed but unsatisfiable', async () => {
      const { status, body } = await call<ApiErrorResponse>(`${h.url}/prompts/generate`, {
        method: 'POST',
        body: JSON.stringify({ experienceId: UNKNOWN_UUID }),
      });

      expect(status).toBe(422);
      expect(JSON.stringify(body.message)).toContain(UNKNOWN_UUID);
    });

    it('rejects an undeclared body property', async () => {
      const { status } = await generate({ experienceId: TICKETING_ID, isAdmin: true });
      expect(status).toBe(400);
    });
  });

  describe('POST /api/prompts/:id/regenerate', () => {
    it('creates a fresh prompt with a new derived seed', async () => {
      const { body: original } = await generate({ experienceId: TICKETING_ID });

      const { status, body } = await call<GetPromptResponse>(
        `${h.url}/prompts/${original.data.id}/regenerate`,
        { method: 'POST' },
      );

      expect(status).toBe(201);
      expect(body.data.id).not.toBe(original.data.id);
      expect(body.data.seed).not.toBe(original.data.seed);
      expect(body.data.experienceId).toBe(TICKETING_ID);
      expect(body.data.difficulty).toBe(original.data.difficulty);
    });

    it('404s for an unknown prompt', async () => {
      const { status } = await call(`${h.url}/prompts/${UNKNOWN_UUID}/regenerate`, {
        method: 'POST',
      });
      expect(status).toBe(404);
    });
  });

  describe('GET /api/prompts', () => {
    it('filters by experience and difficulty, and paginates with a stable order', async () => {
      await generate({ experienceId: TICKETING_ID, difficulty: 'intro', seed: 1 });
      await generate({ experienceId: TICKETING_ID, difficulty: 'standard', seed: 2 });
      await generate({ experienceId: MEDIA_ID, difficulty: 'standard', seed: 3 });

      const all = await call<ListPromptsResponse>(`${h.url}/prompts`);
      expect(all.body.meta.total).toBe(3);

      const ticketing = await call<ListPromptsResponse>(
        `${h.url}/prompts?experienceId=${TICKETING_ID}`,
      );
      expect(ticketing.body.meta.total).toBe(2);
      expect(ticketing.body.data.every((p) => p.experienceId === TICKETING_ID)).toBe(true);

      const intro = await call<ListPromptsResponse>(`${h.url}/prompts?difficulty=intro`);
      expect(intro.body.meta.total).toBe(1);
      expect(intro.body.data[0]?.difficulty).toBe('intro');

      // limit/offset slice without overlap and report the unfiltered total.
      const pageOne = await call<ListPromptsResponse>(`${h.url}/prompts?limit=2&offset=0`);
      const pageTwo = await call<ListPromptsResponse>(`${h.url}/prompts?limit=2&offset=2`);
      expect(pageOne.body.data).toHaveLength(2);
      expect(pageTwo.body.data).toHaveLength(1);
      expect(pageOne.body.meta).toEqual({ total: 3, limit: 2, offset: 0 });
      const ids = [...pageOne.body.data, ...pageTwo.body.data].map((p) => p.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('rejects an out-of-range limit with 400', async () => {
      expect((await call(`${h.url}/prompts?limit=0`)).status).toBe(400);
      expect((await call(`${h.url}/prompts?limit=101`)).status).toBe(400);
    });
  });

  describe('PATCH /api/prompts/:id', () => {
    it('archives and reactivates a prompt', async () => {
      const { body: created } = await generate({ experienceId: TICKETING_ID });

      const archived = await call<GetPromptResponse>(`${h.url}/prompts/${created.data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      });
      expect(archived.status).toBe(200);
      expect(archived.body.data.status).toBe('archived');

      const filtered = await call<ListPromptsResponse>(`${h.url}/prompts?status=archived`);
      expect(filtered.body.meta.total).toBe(1);

      const reactivated = await call<GetPromptResponse>(`${h.url}/prompts/${created.data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
      expect(reactivated.body.data.status).toBe('active');
    });

    it('rejects a status outside the vocabulary with 400', async () => {
      const { body: created } = await generate({ experienceId: TICKETING_ID });
      const { status } = await call(`${h.url}/prompts/${created.data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'deleted' }),
      });
      expect(status).toBe(400);
    });
  });
});
