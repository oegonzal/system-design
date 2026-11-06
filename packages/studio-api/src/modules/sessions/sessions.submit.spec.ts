import { BadGatewayException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  PLATFORM_SECTION_HEADING,
  renderCanvasGoal,
  type ApiErrorResponse,
  type DesignBrief,
  type DesignNarrative,
  type GetSessionResponse,
  type ListRevisionsResponse,
} from '@sysdesign/contracts';
import { Prompt } from '@sysdesign/db';

import { call, UNKNOWN_UUID, useHarness } from '../../test/harness';
import { authoredPrompt, promptsApi } from '../../test/prompts';
import {
  sessionsApi,
  submission,
  validBrief,
  validGraph,
  validNarrative,
} from '../../test/sessions';

describe('sessions', () => {
  const h = useHarness();
  const { startSession, submit } = sessionsApi(h);

  describe('POST /api/sessions/:id/revisions', () => {
    it('[DEL-1] a submission is one canvas run on the prompt’s rubric, and the revision points at its first iteration', async () => {
      const { prompt, sessionId } = await startSession();

      const { status, body } = await submit(sessionId, submission());

      expect(status).toBe(201);
      expect(body.data).toMatchObject({
        sessionId,
        revisionNumber: 1,
        origin: 'user',
        brief: validBrief(),
        narrative: validNarrative(),
        evaluation: {
          runId: 'fake-run-1',
          iteration: 1,
          status: 'running',
          overall: null,
          decision: null,
        },
      });
      expect(body.data.graph).toEqual(validGraph());
      expect(h.loop.startRequests).toEqual([
        {
          pipeline: 'system-design-canvas',
          goal: renderCanvasGoal({ markdown: prompt.markdown, platform: null }),
          output: submission(),
          criteria: prompt.criteria,
          maxIterations: 1,
        },
      ]);

      // Dense numbering, one run per submission. The first grade finished unread:
      // the studio asks the loop before refusing, and lets the second through.
      h.loop.complete('fake-run-1');
      const second = await submit(sessionId, submission(validGraph(), null, null));
      expect(second.body.data.revisionNumber).toBe(2);
      expect(second.body.data.evaluation?.runId).toBe('fake-run-2');
      expect(second.body.data.brief).toBeNull();
    });

    it('[DEL-5] the studio refuses only what is impossible, every problem at once, and writes nothing', async () => {
      const { sessionId } = await startSession();

      const graph = validGraph();
      graph.edges.push({ id: 'e-ghost', source: 'api', target: 'ghost', kind: 'sync' });
      graph.edges.push({ id: 'e-loop', source: 'api', target: 'api', kind: 'sync' });
      graph.edges[1] = { ...graph.edges[1], carries: ['CancelOrder'] };
      const brief: DesignBrief = {
        version: 1,
        // An id past every rubric a prompt can carry, standing rows included (`CANVAS_MAX_CRITERIA`).
        bindings: [{ criterionId: 'c99', nodeIds: ['nobody'], claim: 'bound to nothing' }],
      };
      const narrative: DesignNarrative = {
        version: 1,
        componentRationales: [{ nodeId: 'ghost', prose: 'not drawn' }],
        criterionNarrations: [],
      };
      const { status, body } = await call<ApiErrorResponse>(
        `${h.url}/sessions/${sessionId}/revisions`,
        { method: 'POST', body: JSON.stringify({ graph, brief, narrative }) },
      );

      expect(status).toBe(422);
      const problems = JSON.stringify(body.message);
      for (const fragment of [
        'unknown target node: ghost',
        'self-loop',
        'carries CancelOrder',
        'unknown criterion: c99',
        'unknown node: nobody',
        'explains unknown node: ghost',
      ]) {
        expect(problems).toContain(fragment);
      }
      expect(h.loop.startRequests).toEqual([]);
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(0);
    });

    it('a claim the diagram does not back is a grade, not a 422', async () => {
      const { sessionId } = await startSession();
      const brief: DesignBrief = {
        version: 1,
        bindings: [
          { criterionId: 'c3', nodeIds: ['db'], claim: 'replicated across three regions' },
        ],
      };
      expect((await submit(sessionId, submission(validGraph(), brief))).status).toBe(201);
    });

    it('rejects a shape outside the schema with 400: an unknown kind, a nested config value, a missing brief key', async () => {
      const { sessionId } = await startSession();

      const badKind = validGraph();
      badKind.nodes[0] = { id: 'mf', kind: 'mainframe' as never, label: 'Mainframe' };
      expect((await submit(sessionId, submission(badKind))).status).toBe(400);

      const nested = validGraph();
      nested.nodes[1] = {
        ...nested.nodes[1],
        config: [{ key: 'retry', value: { attempts: 3 } as never }],
      };
      expect((await submit(sessionId, submission(nested))).status).toBe(400);

      expect((await submit(sessionId, { graph: validGraph() })).status).toBe(400);
    });

    it('a grader that refuses the run is a 502, and nothing is written', async () => {
      const { sessionId } = await startSession();
      h.loop.failNextStart = new BadGatewayException('the quality loop is unreachable');

      expect((await submit(sessionId, submission())).status).toBe(502);
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(0);
    });

    it('a prompt whose rubric could not be derived cannot be graded: 503 from the grader, no revision', async () => {
      const { prompt, sessionId } = await startSession();
      const fork = h.em.fork();
      const row = await fork.findOneOrFail(Prompt, prompt.id);
      row.criteria = [];
      await fork.flush();
      h.loop.derivationFails = true;

      expect((await submit(sessionId, submission())).status).toBe(503);
      expect(h.loop.startRequests).toEqual([]);
    });

    it('[DEL-1] two submits at once are one grade: the second is refused while the first is in flight, and numbering stays dense', async () => {
      const { sessionId } = await startSession();

      const results = await Promise.all([
        submit(sessionId, submission()),
        submit(sessionId, submission(validGraph(), null, null)),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(h.loop.startRequests).toHaveLength(1);
      const winner = results.find((r) => r.status === 201);
      expect(winner?.body.data.revisionNumber).toBe(1);

      const third = await submit(sessionId, submission());
      expect(third.status).toBe(409);
      expect(JSON.stringify((third.body as unknown as ApiErrorResponse).message)).toContain(
        'Revision #1 is still being graded',
      );
      const held = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
      expect(held.body.data.inFlight).toEqual({
        kind: 'grade',
        runId: 'fake-run-1',
        revisionNumber: 1,
        state: 'running',
      });
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(1);

      h.loop.complete('fake-run-1');
      const free = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
      expect(free.body.data.inFlight).toBeNull();
      const next = await submit(sessionId, submission());
      expect(next.status).toBe(201);
      expect(next.body.data.revisionNumber).toBe(2);
      expect(h.loop.startRequests).toHaveLength(2);
    });

    it('[DEL-5] a session whose prompt was archived still reads, but takes no submit and no coach until the prompt is back', async () => {
      const { prompt, sessionId } = await startSession();
      await call(`${h.url}/prompts/${prompt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      });

      expect((await call(`${h.url}/sessions/${sessionId}`)).status).toBe(200);
      const refused = await submit(sessionId, submission());
      expect(refused.status).toBe(422);
      expect(JSON.stringify((refused.body as unknown as ApiErrorResponse).message)).toMatch(
        /archived/,
      );
      const coach = await call<ApiErrorResponse>(`${h.url}/sessions/${sessionId}/improve`, {
        method: 'POST',
        body: JSON.stringify(submission()),
      });
      expect(coach.status).toBe(422);
      expect(JSON.stringify(coach.body.message)).toMatch(/archived/);
      expect(h.loop.startRequests).toEqual([]);

      await call(`${h.url}/prompts/${prompt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
      expect((await submit(sessionId, submission())).status).toBe(201);
    });

    it('rejects a revision against a closed session with 422 and an unknown session with 404', async () => {
      const { sessionId } = await startSession();
      await call(`${h.url}/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });
      expect((await submit(sessionId, submission())).status).toBe(422);
      expect((await submit(UNKNOWN_UUID, submission())).status).toBe(404);
    });
  });

  describe('the goal a grade reads', () => {
    it('[GEN-7] closes a platform prompt with its catalogue, so every lens reads the services the author drew with', async () => {
      const { body: authored } = await promptsApi(h).author({
        ...authoredPrompt(),
        platform: 'aws',
      });
      expect(authored.data.platform).toBe('aws');
      const { body: created } = await call<GetSessionResponse>(`${h.url}/sessions`, {
        method: 'POST',
        body: JSON.stringify({ promptId: authored.data.id }),
      });
      const { status } = await submit(created.data.id, submission());
      expect(status).toBe(201);
      const goal = h.loop.startRequests.at(-1)?.goal ?? '';
      expect(goal).toBe(renderCanvasGoal({ markdown: authored.data.markdown, platform: 'aws' }));
      expect(goal.startsWith(authored.data.markdown.trimEnd())).toBe(true);
      expect(goal).toContain(PLATFORM_SECTION_HEADING);
      expect(goal).toContain('`aws.sqs`');
    });
  });
});
