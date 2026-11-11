import { describe, expect, it } from 'vitest';
import {
  CANVAS_MAX_CRITERIA,
  CANVAS_STANDING_CRITERIA,
  PLATFORM_STANDING_CRITERIA,
  PROMPT_COPY,
  PROMPT_MARKDOWN_BOUND,
  PROMPT_TITLE_BOUND,
  type ApiErrorResponse,
  type GetPromptLibraryDocumentResponse,
  type GetPromptResponse,
  type ListPromptLibraryResponse,
  type ListPromptsResponse,
} from '@sysdesign/contracts';

import { call, MEDIA_ID, TICKETING_ID, UNKNOWN_UUID, useHarness } from '../../test/harness';
import { AUTHORED_MARKDOWN, authoredPrompt, promptsApi } from '../../test/prompts';

describe('prompts', () => {
  const h = useHarness();
  const { author } = promptsApi(h);

  describe('POST /api/prompts (authored)', () => {
    it('[GEN-2] stores the markdown verbatim with the rubric the grader derived from it', async () => {
      const { status, body } = await author(authoredPrompt());

      expect(status).toBe(201);
      expect(body.data).toMatchObject({
        experienceId: TICKETING_ID,
        title: 'Serve a unified order history',
        markdown: AUTHORED_MARKDOWN,
        source: 'authored',
        status: 'active',
      });
      expect(body.data.criteria.map((c) => `${c.id}:${c.kind}`)).toEqual([
        'c1:functional',
        'c2:functional',
        'c3:non_functional',
        'c4:scale',
        'c5:constraint',
        'c6:tradeoff',
        'c7:tradeoff',
        'c8:tradeoff',
        'c9:communication',
        'c10:communication',
        'c11:communication',
        'c12:evolution',
      ]);
      expect(h.loop.criteriaRequests).toEqual([
        {
          pipeline: 'system-design-canvas',
          goal: AUTHORED_MARKDOWN,
          room: CANVAS_MAX_CRITERIA - CANVAS_STANDING_CRITERIA.length,
        },
      ]);
      // Platform-neutral unless one is asked for.
      expect(body.data.platform).toBeNull();
    });

    it('[GEN-7] keeps the platform a prompt is written for and closes its rubric with the platform constraint — derived from the text alone', async () => {
      const { status, body } = await author({ ...authoredPrompt(), platform: 'aws' });
      expect(status).toBe(201);
      expect(body.data.platform).toBe('aws');
      expect(body.data.criteria.map((c) => `${c.id}:${c.kind}`)).toEqual([
        'c1:functional',
        'c2:functional',
        'c3:non_functional',
        'c4:scale',
        'c5:constraint',
        'c6:tradeoff',
        'c7:tradeoff',
        'c8:tradeoff',
        'c9:communication',
        'c10:communication',
        'c11:communication',
        'c12:evolution',
        'c13:constraint',
      ]);
      expect(body.data.criteria[12]?.statement).toBe(PLATFORM_STANDING_CRITERIA[0].statement);
      // The derivation read the markdown and nothing of the platform — only the room its standing row leaves.
      expect(h.loop.criteriaRequests).toEqual([
        {
          pipeline: 'system-design-canvas',
          goal: AUTHORED_MARKDOWN,
          room:
            CANVAS_MAX_CRITERIA -
            CANVAS_STANDING_CRITERIA.length -
            PLATFORM_STANDING_CRITERIA.length,
        },
      ]);
      const refused = await author({ ...authoredPrompt(), platform: 'gcp' });
      expect(refused.status).toBe(400);
    });

    it('[DEL-2] the rubric is derived once and its ids are stable on every later read', async () => {
      const { body: created } = await author(authoredPrompt());
      const first = await call<GetPromptResponse>(`${h.url}/prompts/${created.data.id}`);
      const second = await call<GetPromptResponse>(`${h.url}/prompts/${created.data.id}`);

      expect(first.body.data.criteria).toEqual(created.data.criteria);
      expect(second.body.data.criteria).toEqual(created.data.criteria);
      expect(h.loop.criteriaRequests).toHaveLength(1);
    });

    it('[DEL-6] when the grader cannot derive a rubric it answers 503 with the diagnostic and no prompt is written', async () => {
      h.loop.derivationFails = true;
      const { status, body } = await call<ApiErrorResponse & { llm: unknown; diagnostic: unknown }>(
        `${h.url}/prompts`,
        { method: 'POST', body: JSON.stringify(authoredPrompt()) },
      );

      expect(status).toBe(503);
      expect(body.llm).toEqual({ model: 'fake-model' });
      expect(body.diagnostic).toMatchObject({ stage: 'criteria', reason: 'llm-failed' });
      const list = await call<ListPromptsResponse>(`${h.url}/prompts`);
      expect(list.body.meta.total).toBe(0);
    });

    it('rejects an unknown experience with 422, an undeclared key and an empty body with 400', async () => {
      expect((await author({ ...authoredPrompt(), experienceId: UNKNOWN_UUID })).status).toBe(422);
      expect((await author({ ...authoredPrompt(), difficulty: 'intro' })).status).toBe(400);
      expect((await author({ ...authoredPrompt(), markdown: '' })).status).toBe(400);
    });
  });

  describe('the library', () => {
    it('[GEN-3] lists the loop’s library and imports a document as a prompt with its own rubric', async () => {
      const list = await call<ListPromptLibraryResponse>(`${h.url}/prompts/library`);
      expect(list.status).toBe(200);
      expect(list.body.data).toEqual([
        { id: 'order-history', title: 'Serve an order history', folder: null },
        { id: 'model/tenant-permissions', title: 'Decide who may do what', folder: 'model' },
      ]);

      const document = await call<GetPromptLibraryDocumentResponse>(
        `${h.url}/prompts/library/order-history`,
      );
      expect(document.body.data.markdown).toContain('## Functional requirements');

      const { status, body } = await call<GetPromptResponse>(`${h.url}/prompts/import`, {
        method: 'POST',
        body: JSON.stringify({ libraryId: 'order-history' }),
      });
      expect(status).toBe(201);
      expect(body.data).toMatchObject({
        source: 'library',
        experienceId: null,
        format: 'system',
        title: 'Serve an order history',
        markdown: document.body.data.markdown,
      });
      expect(body.data.criteria.map((c) => c.kind)).toEqual([
        'functional',
        'functional',
        'non_functional',
        'constraint',
        'tradeoff',
        'tradeoff',
        'tradeoff',
        'communication',
        'communication',
        'communication',
        'evolution',
      ]);
    });

    it('[GEN-4] [GEN-5] a document’s folder names its format on import unless one is given, and an authored prompt keeps the format it was written in', async () => {
      const foldered = await call<GetPromptResponse>(`${h.url}/prompts/import`, {
        method: 'POST',
        body: JSON.stringify({ libraryId: 'model/tenant-permissions' }),
      });
      expect(foldered.status).toBe(201);
      expect(foldered.body.data.format).toBe('model');
      expect(foldered.body.data.criteria.map((c) => c.kind)).toEqual([
        'functional',
        'domain_model',
        'tradeoff',
        'tradeoff',
        'tradeoff',
        'communication',
        'communication',
        'communication',
        'evolution',
      ]);
      const overridden = await call<GetPromptResponse>(`${h.url}/prompts/import`, {
        method: 'POST',
        body: JSON.stringify({ libraryId: 'model/tenant-permissions', format: 'workflow' }),
      });
      expect(overridden.body.data.format).toBe('workflow');
      const { body } = await author({ ...authoredPrompt(), format: 'evolution' });
      expect(body.data.format).toBe('evolution');
    });

    it('a document the library does not hold is 404 to read and 422 to import', async () => {
      expect((await call(`${h.url}/prompts/library/nope`)).status).toBe(404);
      const { status } = await call(`${h.url}/prompts/import`, {
        method: 'POST',
        body: JSON.stringify({ libraryId: 'nope' }),
      });
      expect(status).toBe(422);
    });
  });

  describe('the rubric', () => {
    it('[UX-14] can be re-derived while no session was started on it, and every read says when it is locked', async () => {
      const { body: created } = await author(authoredPrompt());
      expect(created.data.rubricLocked).toBe(false);
      const rederived = await call<GetPromptResponse>(
        `${h.url}/prompts/${created.data.id}/criteria`,
        {
          method: 'POST',
        },
      );
      expect(rederived.status).toBe(200);
      expect(rederived.body.data.rubricLocked).toBe(false);
      expect(h.loop.criteriaRequests).toHaveLength(2);

      // A session is started — nothing graded yet — and the prompt is locked.
      await call(`${h.url}/sessions`, {
        method: 'POST',
        body: JSON.stringify({ promptId: created.data.id }),
      });
      const read = await call<GetPromptResponse>(`${h.url}/prompts/${created.data.id}`);
      expect(read.body.data.rubricLocked).toBe(true);
      const listed = await call<ListPromptsResponse>(`${h.url}/prompts`);
      expect(listed.body.data.map((p) => p.rubricLocked)).toEqual([true]);

      // The refusals are the reader's sentences — no id, and no claim that anything was graded.
      const frozen = await call<ApiErrorResponse>(`${h.url}/prompts/${created.data.id}/criteria`, {
        method: 'POST',
      });
      expect(frozen.status).toBe(409);
      expect(frozen.body.message).toBe(PROMPT_COPY.criteriaLocked);
      const rewrite = await call<ApiErrorResponse>(`${h.url}/prompts/${created.data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ markdown: '# Another prompt\n\n- one thing' }),
      });
      expect(rewrite.status).toBe(409);
      expect(rewrite.body.message).toBe(PROMPT_COPY.textLocked);
      // Archiving stays free on a locked prompt.
      const archived = await call<GetPromptResponse>(`${h.url}/prompts/${created.data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      });
      expect(archived.body.data).toMatchObject({ status: 'archived', rubricLocked: true });
    });

    it('rewriting the markdown before any session derives the rubric again', async () => {
      const { body: created } = await author(authoredPrompt());
      const { status, body } = await call<GetPromptResponse>(
        `${h.url}/prompts/${created.data.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            title: 'Renamed',
            markdown: '# Renamed\n\n- one thing\n- two things',
          }),
        },
      );
      expect(status).toBe(200);
      expect(body.data.title).toBe('Renamed');
      // Two derived rows closed by the five standing criteria.
      expect(body.data.criteria.map((c) => c.id)).toEqual([
        'c1',
        'c2',
        'c3',
        'c4',
        'c5',
        'c6',
        'c7',
        'c8',
        'c9',
      ]);
      expect(h.loop.criteriaRequests).toHaveLength(2);
    });

    it('[DEL-6] a rewrite whose rubric the grader cannot derive is 503 and leaves the prompt exactly as it was', async () => {
      const { body: created } = await author(authoredPrompt());
      h.loop.derivationFails = true;

      const { status } = await call<ApiErrorResponse>(`${h.url}/prompts/${created.data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Renamed', markdown: '# Renamed\n\n- one thing' }),
      });
      expect(status).toBe(503);

      const { body } = await call<GetPromptResponse>(`${h.url}/prompts/${created.data.id}`);
      expect(body.data.title).toBe(created.data.title);
      expect(body.data.markdown).toBe(created.data.markdown);
      expect(body.data.criteria).toEqual(created.data.criteria);
    });
  });

  describe('GET /api/prompts', () => {
    it('filters by source, status and experience, and paginates with a stable order', async () => {
      await author(authoredPrompt());
      await author({ ...authoredPrompt(), title: 'Second', experienceId: MEDIA_ID });
      await call(`${h.url}/prompts/import`, {
        method: 'POST',
        body: JSON.stringify({ libraryId: 'order-history' }),
      });

      const all = await call<ListPromptsResponse>(`${h.url}/prompts`);
      expect(all.body.meta.total).toBe(3);

      const authored = await call<ListPromptsResponse>(`${h.url}/prompts?source=authored`);
      expect(authored.body.meta.total).toBe(2);
      const media = await call<ListPromptsResponse>(`${h.url}/prompts?experienceId=${MEDIA_ID}`);
      expect(media.body.data.map((p) => p.title)).toEqual(['Second']);

      const pageOne = await call<ListPromptsResponse>(`${h.url}/prompts?limit=2&offset=0`);
      const pageTwo = await call<ListPromptsResponse>(`${h.url}/prompts?limit=2&offset=2`);
      expect(pageOne.body.data).toHaveLength(2);
      expect(pageTwo.body.data).toHaveLength(1);
      expect(pageOne.body.meta).toEqual({ total: 3, limit: 2, offset: 0 });
      expect(new Set([...pageOne.body.data, ...pageTwo.body.data].map((p) => p.id)).size).toBe(3);
    });

    it('rejects an out-of-range limit and an unknown filter with 400', async () => {
      expect((await call(`${h.url}/prompts?limit=0`)).status).toBe(400);
      expect((await call(`${h.url}/prompts?limit=101`)).status).toBe(400);
      expect((await call(`${h.url}/prompts?difficulty=intro`)).status).toBe(400);
    });
  });

  describe('PATCH /api/prompts/:id', () => {
    it('archives and reactivates a prompt', async () => {
      const { body: created } = await author(authoredPrompt());

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

    it('[UX-19] a rewrite takes a title and text up to the ceilings a create takes, so a stored one is sent back unchanged', async () => {
      // A title past what is asked and within what is accepted, as the composer lets one be written.
      const title = 'Serve a unified order history '
        .repeat(6)
        .slice(0, PROMPT_TITLE_BOUND.target + 20);
      const { body: created } = await author({ ...authoredPrompt(), title });
      expect(created.data.title).toBe(title);
      const patch = (body: unknown) =>
        call<GetPromptResponse>(`${h.url}/prompts/${created.data.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });

      const unchanged = await patch({ title });
      expect(unchanged.status).toBe(200);
      expect(unchanged.body.data.title).toBe(title);

      const atCeiling = 'x'.repeat(PROMPT_TITLE_BOUND.ceiling);
      expect((await patch({ title: atCeiling })).body.data.title).toBe(atCeiling);
      expect((await patch({ title: `${atCeiling}x` })).status).toBe(400);

      const markdown = AUTHORED_MARKDOWN.padEnd(PROMPT_MARKDOWN_BOUND.ceiling, '\n');
      const rewritten = await patch({ markdown });
      expect(rewritten.status).toBe(200);
      expect(rewritten.body.data.markdown).toBe(markdown);
      expect((await patch({ markdown: `${markdown}x` })).status).toBe(400);
    });

    it('rejects a status outside the vocabulary with 400 and an unknown prompt with 404', async () => {
      const { body: created } = await author(authoredPrompt());
      const { status } = await call(`${h.url}/prompts/${created.data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'deleted' }),
      });
      expect(status).toBe(400);
      const missing = await call(`${h.url}/prompts/${UNKNOWN_UUID}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      });
      expect(missing.status).toBe(404);
    });
  });
});
