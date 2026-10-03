import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CRITERION_STATEMENT_BOUND,
  criteriaFromDraft,
  DESIGN_PROMPT_SCENARIO_BOUND,
  designPromptDraftSchema,
  keptAtMost,
  modelSchema,
  PROMPT_COPY,
  PROMPT_MARKDOWN_BOUND,
  PROMPT_TITLE_BOUND,
  SOFT_ISSUE_NOTE,
} from '@sysdesign/contracts';
import type {
  ApiErrorResponse,
  AuthorPromptRequest,
  DesignPromptDraft,
  GetPromptGenerationResponse,
  GetRevisionResponse,
  GetSessionResponse,
  GetPromptLibraryDocumentResponse,
  GetPromptResponse,
  ListPromptLibraryResponse,
  ListPromptsResponse,
  StartPromptGenerationResponse,
} from '@sysdesign/contracts';

import { call, createHarness, resetDesignData, type Harness } from '../../test/harness';

const TICKETING_ID = 'e1000000-0000-4000-8000-000000000001';
const MEDIA_ID = 'e1000000-0000-4000-8000-000000000002';
const UNKNOWN_UUID = '11111111-1111-4111-8111-111111111111';

/** Two functional bullets, one quality row, one scale row, one constraint: `c1…c5` under the fake grader. */
export const AUTHORED_MARKDOWN = [
  '# Serve a unified order history',
  '',
  '## Scenario',
  '',
  'You run the order-history service for a retailer that sells online and in stores.',
  '',
  '## Functional requirements',
  '',
  "1. Return a customer's past orders newest first, with line items.",
  '2. Ingest online orders as the storefront pushes them by webhook.',
  '',
  '## Non-functional requirements',
  '',
  '| Kind | Requirement | Target |',
  '| --- | --- | --- |',
  '| latency | order-history reads | p99 ≤ 300 ms |',
  '',
  '## Scale targets',
  '',
  '| Metric | Target |',
  '| --- | --- |',
  '| peak read rate | 2,000 requests/s |',
  '',
  '## Constraints',
  '',
  '- The point-of-sale system only answers polling.',
  '',
].join('\n');

export const authoredPrompt = (): AuthorPromptRequest => ({
  title: 'Serve a unified order history',
  markdown: AUTHORED_MARKDOWN,
  experienceId: TICKETING_ID,
});

const draft = (): DesignPromptDraft => ({
  title: 'Keep a flash on-sale fair',
  scenario: 'You run the ticketing platform for a venue whose on-sales spike 28x within a minute.',
  functionalRequirements: [
    'Reserve a seat for exactly one buyer.',
    'Release it when checkout lapses.',
  ],
  nonFunctionalRequirements: [
    { kind: 'latency', requirement: 'reservation', target: 'p99 ≤ 500 ms' },
  ],
  scale: [{ metric: 'peak buyers', target: '10,000 concurrent' }],
  constraints: ['Inventory lives in one relational database.'],
});

describe('prompts', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await resetDesignData(h.em, h.loop);
  });

  const author = (body: unknown) =>
    call<GetPromptResponse>(`${h.url}/prompts`, { method: 'POST', body: JSON.stringify(body) });

  const startGeneration = (body: unknown) =>
    call<StartPromptGenerationResponse>(`${h.url}/prompts/generate`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  const generation = (runId: string) =>
    call<GetPromptGenerationResponse>(`${h.url}/prompts/generate/${runId}`);

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
      ]);
      expect(h.loop.criteriaRequests).toEqual([
        { pipeline: 'system-design-canvas', goal: AUTHORED_MARKDOWN },
      ]);
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
      expect(list.body.data).toEqual([{ id: 'order-history', title: 'Serve an order history' }]);

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
        title: 'Serve an order history',
        markdown: document.body.data.markdown,
      });
      expect(body.data.criteria.map((c) => c.kind)).toEqual([
        'functional',
        'functional',
        'non_functional',
        'constraint',
      ]);
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

  describe('POST /api/prompts/generate', () => {
    it('[GEN-1] starts a design-prompt run from the experience and claims its best draft once', async () => {
      const started = await startGeneration({ experienceId: TICKETING_ID });
      expect(started.status).toBe(202);
      expect(started.body.data).toEqual({ runId: 'fake-run-1', status: 'running' });
      expect(h.loop.startRequests[0]).toMatchObject({
        pipeline: 'design-prompt',
        maxIterations: 2,
      });
      expect(h.loop.startRequests[0]?.goal).toContain('Where: Ticketing & events platform');
      expect(h.loop.startRequests[0]?.goal).toContain('## Highlights');

      const running = await generation('fake-run-1');
      expect(running.status).toBe(200);
      expect(running.body.data).toEqual({
        runId: 'fake-run-1',
        status: 'running',
        decision: null,
        overall: null,
        prompt: null,
        error: null,
      });

      h.loop.complete('fake-run-1', [
        { overall: 58, decision: 'revise', mode: 'initial', artifact: draft() },
        { overall: 86, decision: 'accept', mode: 'revise', artifact: draft() },
      ]);
      const done = await generation('fake-run-1');
      expect(done.body.data).toMatchObject({ status: 'complete', decision: 'accept', overall: 86 });
      const prompt = done.body.data.prompt;
      expect(prompt).not.toBeNull();
      expect(prompt).toMatchObject({
        source: 'generated',
        experienceId: TICKETING_ID,
        title: 'Keep a flash on-sale fair',
      });
      expect(prompt?.markdown.startsWith('# Keep a flash on-sale fair\n')).toBe(true);
      expect(prompt?.markdown).toContain('## Non-functional requirements');
      // The rubric is the draft's rows, one criterion each — nothing was derived.
      expect(prompt?.criteria).toEqual(criteriaFromDraft(draft()));
      expect(prompt?.criteria.map((c) => `${c.id}:${c.kind}`)).toEqual([
        'c1:functional',
        'c2:functional',
        'c3:non_functional',
        'c4:scale',
        'c5:constraint',
      ]);
      expect(h.loop.criteriaRequests).toEqual([]);

      // Claimed once: concurrent polls answer the same prompt, and one row exists.
      const [again, andAgain] = await Promise.all([
        generation('fake-run-1'),
        generation('fake-run-1'),
      ]);
      expect(again.body.data.prompt?.id).toBe(prompt?.id);
      expect(andAgain.body.data.prompt?.id).toBe(prompt?.id);
      const list = await call<ListPromptsResponse>(`${h.url}/prompts?source=generated`);
      expect(list.body.meta.total).toBe(1);
      expect(h.loop.criteriaRequests).toEqual([]);
    });

    it('[GEN-1] [QL-41] a draft the run kept past its ceilings is claimed whole, its overruns logged, and every row a criterion the grader takes back on a grade', async () => {
      // The longest a lenient read keeps of each field the draft declares —
      // whole to the cut point, never more — so each row composes at its most.
      const bounds = modelSchema(designPromptDraftSchema).bounds;
      const longest = (path: string): string =>
        'every on-sale seat is held for exactly one buyer until checkout lapses '
          .repeat(120)
          .slice(0, keptAtMost(bounds[path]))
          .trimEnd();
      const wordy: DesignPromptDraft = {
        title: 'Keep a flash on-sale fair',
        // Past what the scenario accepts, short of where a read would cut it.
        scenario: longest('scenario')
          .slice(0, DESIGN_PROMPT_SCENARIO_BOUND.ceiling + 600)
          .trimEnd(),
        functionalRequirements: [longest('functionalRequirements[]')],
        nonFunctionalRequirements: [
          {
            kind: longest('nonFunctionalRequirements[].kind'),
            requirement: longest('nonFunctionalRequirements[].requirement'),
            target: longest('nonFunctionalRequirements[].target'),
          },
        ],
        scale: [{ metric: longest('scale[].metric'), target: longest('scale[].target') }],
        constraints: [longest('constraints[]')],
      };
      expect(wordy.scenario.length).toBeGreaterThan(DESIGN_PROMPT_SCENARIO_BOUND.ceiling);
      expect(designPromptDraftSchema.safeParse(wordy).success).toBe(false);

      const logged = vi.spyOn(Logger.prototype, 'log');
      await startGeneration({ experienceId: TICKETING_ID });
      h.loop.complete('fake-run-1', [{ overall: 84, decision: 'accept', artifact: wordy }]);
      const done = await generation('fake-run-1');
      expect(done.body.data).toMatchObject({ status: 'complete', error: null });
      const prompt = done.body.data.prompt;
      if (!prompt) throw new Error('claimed nothing');
      expect(prompt.markdown).toContain(wordy.scenario);
      expect(prompt.criteria).toEqual(criteriaFromDraft(wordy));
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining(
          `scenario: ${wordy.scenario.length.toLocaleString('en-US')} characters; ${DESIGN_PROMPT_SCENARIO_BOUND.target.toLocaleString('en-US')} asked, ${DESIGN_PROMPT_SCENARIO_BOUND.ceiling.toLocaleString('en-US')} accepted ${SOFT_ISSUE_NOTE}`,
        ),
      );
      logged.mockRestore();

      // Each row composes within what the grader takes back as a supplied
      // statement, and a grade hands the rubric back as it was claimed.
      for (const criterion of prompt.criteria) {
        expect(criterion.statement.length).toBeLessThanOrEqual(
          keptAtMost(CRITERION_STATEMENT_BOUND),
        );
      }
      const session = await call<GetSessionResponse>(`${h.url}/sessions`, {
        method: 'POST',
        body: JSON.stringify({ promptId: prompt.id }),
      });
      const graded = await call<GetRevisionResponse>(
        `${h.url}/sessions/${session.body.data.id}/revisions`,
        {
          method: 'POST',
          body: JSON.stringify({
            graph: { nodes: [{ id: 'api', kind: 'service', label: 'API' }], edges: [] },
            brief: null,
            narrative: null,
          }),
        },
      );
      expect(graded.status).toBe(201);
      expect(h.loop.startRequests.at(-1)?.criteria).toEqual(prompt.criteria);
    });

    it('[UX-14] a generated prompt is not re-derived; rewriting it derives once and makes it authored', async () => {
      await startGeneration({ experienceId: TICKETING_ID });
      h.loop.complete('fake-run-1', [{ overall: 80, mode: 'initial', artifact: draft() }]);
      const { body: done } = await generation('fake-run-1');
      const id = done.data.prompt?.id;
      if (!id) throw new Error('claimed nothing');

      const rederive = await call<ApiErrorResponse>(`${h.url}/prompts/${id}/criteria`, {
        method: 'POST',
      });
      expect(rederive.status).toBe(409);
      expect(rederive.body.message).toBe(PROMPT_COPY.generatedCriteria);
      expect(h.loop.criteriaRequests).toEqual([]);

      const rewritten = await call<GetPromptResponse>(`${h.url}/prompts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ markdown: '# Rewritten\n\n- one thing\n- two things' }),
      });
      expect(rewritten.status).toBe(200);
      expect(rewritten.body.data).toMatchObject({
        source: 'authored',
        experienceId: TICKETING_ID,
        markdown: '# Rewritten\n\n- one thing\n- two things',
      });
      expect(rewritten.body.data.criteria.map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(h.loop.criteriaRequests).toHaveLength(1);
      // Authored now: it can be re-derived like any written prompt.
      const again = await call<GetPromptResponse>(`${h.url}/prompts/${id}/criteria`, {
        method: 'POST',
      });
      expect(again.status).toBe(200);
      expect(h.loop.criteriaRequests).toHaveLength(2);
    });

    it('[GEN-1] omitting the experience rotates through the least practised ones, fixture order breaking ties', async () => {
      await author(authoredPrompt()); // ticketing now has a prompt
      const drawn: (string | null)[] = [];
      for (let n = 1; n <= 6; n += 1) {
        const { status } = await startGeneration({});
        expect(status).toBe(202);
        h.loop.complete(`fake-run-${n}`, [{ overall: 80, mode: 'initial', artifact: draft() }]);
        const done = await generation(`fake-run-${n}`);
        drawn.push(done.body.data.prompt?.experienceId ?? null);
      }
      expect(h.loop.startRequests[0]?.goal.startsWith('# Media, collectibles')).toBe(true);
      // Five experiences without a prompt, in fixture order; then every one has one and ticketing is first again.
      expect(drawn).toEqual([
        MEDIA_ID,
        'e1000000-0000-4000-8000-000000000003',
        'e1000000-0000-4000-8000-000000000004',
        'e1000000-0000-4000-8000-000000000005',
        'e1000000-0000-4000-8000-000000000006',
        TICKETING_ID,
      ]);
    });

    it('a failed run, and a run whose draft is not a prompt, are reported as failed and claim nothing', async () => {
      await startGeneration({ experienceId: TICKETING_ID });
      h.loop.fail('fake-run-1', 'the model went away');
      const failed = await generation('fake-run-1');
      expect(failed.body.data).toMatchObject({ status: 'failed', error: 'the model went away' });

      await startGeneration({ experienceId: TICKETING_ID });
      h.loop.complete('fake-run-2', [{ overall: 80, mode: 'initial', artifact: { nope: true } }]);
      const junk = await generation('fake-run-2');
      expect(junk.body.data.status).toBe('failed');
      expect(junk.body.data.error).toContain('no prompt draft');

      const list = await call<ListPromptsResponse>(`${h.url}/prompts`);
      expect(list.body.meta.total).toBe(0);
    });

    it('404s for a run this studio never started, 422 for an unknown experience', async () => {
      expect((await generation('nope')).status).toBe(404);
      expect((await startGeneration({ experienceId: UNKNOWN_UUID })).status).toBe(422);
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
      expect(body.data.criteria.map((c) => c.id)).toEqual(['c1', 'c2']);
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
