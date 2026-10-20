import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  CRITERION_STATEMENT_BOUND,
  criteriaFromDraft,
  DESIGN_PROMPT_SCENARIO_BOUND,
  designPromptDraftSchema,
  keptAtMost,
  modelSchema,
  PROMPT_COPY,
  SOFT_ISSUE_NOTE,
  type ApiErrorResponse,
  type DesignPromptDraft,
  type GetPromptGenerationResponse,
  type GetRevisionResponse,
  type GetSessionResponse,
  type GetPromptResponse,
  type ListPromptsResponse,
  type StartPromptGenerationResponse,
} from '@sysdesign/contracts';

import { call, MEDIA_ID, TICKETING_ID, UNKNOWN_UUID, useHarness } from '../../test/harness';
import { authoredPrompt, promptsApi } from '../../test/prompts';

const draft = (): DesignPromptDraft => ({
  title: 'Keep a flash on-sale fair',
  scenario: 'You run the ticketing platform for a venue whose on-sales spike 28x within a minute.',
  functionalRequirements: [
    'Reserve a seat for exactly one buyer.',
    'Release it when checkout lapses.',
  ],
  domainAndData: [],
  interfaces: [],
  nonFunctionalRequirements: [
    { kind: 'latency', requirement: 'reservation', target: 'p99 ≤ 500 ms' },
  ],
  scale: [{ metric: 'peak buyers', target: '10,000 concurrent' }],
  decisions: [],
  constraints: ['Inventory lives in one relational database.'],
});

describe('prompts', () => {
  const h = useHarness();
  const { author } = promptsApi(h);

  const startGeneration = (body: unknown) =>
    call<StartPromptGenerationResponse>(`${h.url}/prompts/generate`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  const generation = (runId: string) =>
    call<GetPromptGenerationResponse>(`${h.url}/prompts/generate/${runId}`);

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
      // No format asked for: the writer is still told the default, the whole system.
      expect(h.loop.startRequests[0]?.goal).toContain('## Practice format\n\nWhole system: ');

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
        'c6:tradeoff',
        'c7:tradeoff',
        'c8:tradeoff',
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

    it('[GEN-4] a format and the emphasised kinds reach the writer as sections of its goal, each kind once, and the claimed prompt keeps the format', async () => {
      const started = await startGeneration({
        experienceId: TICKETING_ID,
        format: 'model',
        emphasis: ['interface', 'interface', 'tradeoff'],
      });
      expect(started.status).toBe(202);
      const goal = h.loop.startRequests.at(-1)?.goal ?? '';
      expect(goal).toContain('## Practice format\n\nDomain model and API: ');
      expect(goal).toContain('## Emphasis\n\n- Interface\n- Trade-off\n');
      h.loop.complete(started.body.data.runId, [
        { overall: 86, decision: 'accept', mode: 'initial', artifact: draft() },
      ]);
      const { body } = await generation(started.body.data.runId);
      expect(body.data.status).toBe('complete');
      expect(body.data.prompt?.format).toBe('model');
    });

    it('[GEN-1] [QL-58] a draft the run kept past its ceilings is claimed whole, its overruns logged, and every row a criterion the grader takes back on a grade', async () => {
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
        domainAndData: [],
        interfaces: [],
        decisions: [],
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
      expect(rewritten.body.data.criteria.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
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
});
