import { BadGatewayException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_IMPROVE_ITERATIONS,
  type ApiErrorResponse,
  type CanvasGraph,
  type DesignBrief,
  type DesignNarrative,
  type DesignSubmission,
  type GetEvaluationResponse,
  type SessionDraft,
  type GetImproveRunResponse,
  type GetPromptResponse,
  type GetRevisionResponse,
  type GetSessionDraftResponse,
  type GetSessionResponse,
  type ListCoachingRunsResponse,
  type ListRevisionsResponse,
  type ListSessionsResponse,
  type StartImproveResponse,
} from '@sysdesign/contracts';
import { DesignRevision, DesignSession, Prompt } from '@sysdesign/db';

import { call, createHarness, resetDesignData, type Harness } from '../../test/harness';
import { authoredPrompt } from '../prompts/prompts.controller.spec';

const UNKNOWN_UUID = '11111111-1111-4111-8111-111111111111';

const validGraph = (): CanvasGraph => ({
  nodes: [
    { id: 'client', kind: 'client', label: 'Web client' },
    {
      id: 'api',
      kind: 'service',
      label: 'API',
      config: [{ key: 'replicas', value: 3 }],
      operations: [{ name: 'listOrders', kind: 'query' }],
    },
    { id: 'db', kind: 'database', label: 'Primary DB', position: { x: 100, y: 200 } },
  ],
  edges: [
    { id: 'e-client-api', source: 'client', target: 'api', kind: 'sync', carries: ['listOrders'] },
    { id: 'e-api-db', source: 'api', target: 'db', kind: 'sync' },
  ],
});

const validBrief = (): DesignBrief => ({
  version: 1,
  bindings: [
    {
      criterionId: 'c1',
      nodeIds: ['api', 'db'],
      path: ['e-client-api', 'e-api-db'],
      claim: 'the API reads the customer shard',
    },
    { criterionId: 'c3', nodeIds: ['api'], claim: 'three replicas behind the gateway' },
  ],
});

const validNarrative = (overview = 'first cut'): DesignNarrative => ({
  version: 1,
  overview,
  componentRationales: [{ nodeId: 'db', prose: 'The primary DB is the source of truth.' }],
  criterionNarrations: [{ criterionId: 'c1', prose: 'Client → API → DB, newest first.' }],
});

const submission = (
  graph: CanvasGraph = validGraph(),
  brief: DesignBrief | null = validBrief(),
  narrative: DesignNarrative | null = validNarrative(),
): DesignSubmission => ({ graph, brief, narrative });

/** An unsubmitted canvas: a binding still empty and a claim not yet written — shape only. */
const draft = (): SessionDraft => ({
  graph: validGraph(),
  brief: { version: 1, bindings: [{ criterionId: 'c2', nodeIds: [], claim: '' }] },
  narrative: null,
});

/** The coach's second iteration: the author's graph plus a read replica, ids prefixed ai-. */
const coached = (): DesignSubmission => {
  const base = submission();
  return {
    ...base,
    graph: {
      nodes: [...base.graph.nodes, { id: 'ai-replica', kind: 'replica', label: 'Read replica' }],
      edges: [
        ...base.graph.edges,
        { id: 'ai-e-replica', source: 'db', target: 'ai-replica', kind: 'async' },
      ],
    },
  };
};

describe('sessions', () => {
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

  const makePrompt = async () => {
    const { body } = await call<GetPromptResponse>(`${h.url}/prompts`, {
      method: 'POST',
      body: JSON.stringify(authoredPrompt()),
    });
    return body.data;
  };

  const createSession = async (promptId: string) =>
    call<GetSessionResponse>(`${h.url}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ promptId }),
    });

  const startSession = async () => {
    const prompt = await makePrompt();
    const { body } = await createSession(prompt.id);
    return { prompt, sessionId: body.data.id };
  };

  const submit = (sessionId: string, body: unknown) =>
    call<GetRevisionResponse>(`${h.url}/sessions/${sessionId}/revisions`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  const evaluation = (revisionId: string) =>
    call<GetEvaluationResponse>(`${h.url}/revisions/${revisionId}/evaluation`);

  describe('POST /api/sessions', () => {
    it('creates an in-progress session with no grade yet', async () => {
      const prompt = await makePrompt();
      const { status, body } = await createSession(prompt.id);

      expect(status).toBe(201);
      expect(body.data).toMatchObject({
        promptId: prompt.id,
        status: 'in-progress',
        revisionCount: 0,
        latestRevisionNumber: null,
        latestOverall: null,
        latestDecision: null,
        latestEvaluationStatus: null,
      });
    });

    it('rejects an archived prompt and an unknown prompt with 422', async () => {
      const prompt = await makePrompt();
      await call(`${h.url}/prompts/${prompt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      });
      const archived = await call<ApiErrorResponse>(`${h.url}/sessions`, {
        method: 'POST',
        body: JSON.stringify({ promptId: prompt.id }),
      });
      expect(archived.status).toBe(422);
      expect(JSON.stringify(archived.body.message)).toContain('archived');
      expect((await createSession(UNKNOWN_UUID)).status).toBe(422);
    });
  });

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
          goal: prompt.markdown,
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
        bindings: [{ criterionId: 'c9', nodeIds: ['nobody'], claim: 'bound to nothing' }],
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
        'unknown criterion: c9',
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
        'revision #1 is still being graded',
      );
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(1);

      h.loop.complete('fake-run-1');
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

  describe('GET /api/revisions/:id/evaluation', () => {
    it('[DEL-4] reads the run for the revision’s iteration, grounds findings onto the canvas, and caches the terminal grade', async () => {
      const { sessionId } = await startSession();
      const { body: created } = await submit(sessionId, submission());
      const revisionId = created.data.id;

      const running = await evaluation(revisionId);
      expect(running.status).toBe(200);
      expect(running.body.data).toMatchObject({
        runId: 'fake-run-1',
        iteration: 1,
        status: 'running',
        overall: null,
        decision: null,
        dimensions: {},
        findings: [],
        criterionResults: [],
        stopReason: null,
        error: null,
      });

      h.loop.complete('fake-run-1');
      const done = await evaluation(revisionId);
      expect(done.body.data).toMatchObject({
        status: 'complete',
        overall: 64,
        decision: 'revise',
        dimensions: { coverage: 70, quality_attributes: 52, compliance: 100 },
        stopReason: 'max-iterations',
      });
      expect(done.body.data.findings).toEqual([
        {
          id: 'unhandled_failure|node.2',
          lenses: ['critic.architecture', 'critic.scenarios'],
          type: 'unhandled_failure',
          severity: 'high',
          confidence: 'high',
          fixability: 'fixable_local',
          criterionIds: ['c2'],
          locations: [{ ref: 'node.2', label: 'api · service · API', part: 'node', key: 'api' }],
          nodeIds: ['api'],
          edgeIds: [],
          locationRefs: ['node.2'],
          rationale: 'a single instance serves every read; a restart drops the target',
          reconciledTo: null,
        },
      ]);
      expect(done.body.data.criterionResults.map((r) => `${r.criterionId}:${r.result}`)).toEqual([
        'c1:pass',
        'c2:partial',
        'c3:fail',
        'c4:fail',
        'c5:fail',
      ]);

      // The terminal grade was written back: lists never fetch the loop.
      const revision = await call<GetRevisionResponse>(`${h.url}/revisions/${revisionId}`);
      expect(revision.body.data.evaluation).toEqual({
        runId: 'fake-run-1',
        iteration: 1,
        status: 'complete',
        overall: 64,
        decision: 'revise',
      });
      const sessions = await call<ListSessionsResponse>(`${h.url}/sessions`);
      expect(sessions.body.data[0]).toMatchObject({
        id: sessionId,
        revisionCount: 1,
        latestRevisionNumber: 1,
        latestOverall: 64,
        latestDecision: 'revise',
        latestEvaluationStatus: 'complete',
      });
    });

    it('a failed run is reported failed with its error, cached as failed on the revision, and a resubmit starts a fresh run', async () => {
      const { sessionId } = await startSession();
      const { body: created } = await submit(sessionId, submission());
      h.loop.fail('fake-run-1', 'the model went away');

      const { body } = await evaluation(created.data.id);
      expect(body.data).toMatchObject({
        status: 'failed',
        error: 'the model went away',
        overall: null,
      });
      const read = await call<GetRevisionResponse>(`${h.url}/revisions/${created.data.id}`);
      expect(read.body.data.evaluation).toMatchObject({
        status: 'failed',
        overall: null,
        decision: null,
      });

      const again = await submit(sessionId, submission());
      expect(again.status).toBe(201);
      expect(again.body.data).toMatchObject({
        revisionNumber: 2,
        evaluation: { runId: 'fake-run-2', status: 'running' },
      });
    });

    it('[DEL-3] a failed coaching run started from a draft marks the draft revision failed and imports nothing', async () => {
      const { sessionId } = await startSession();
      const started = await call<StartImproveResponse>(`${h.url}/sessions/${sessionId}/improve`, {
        method: 'POST',
        body: JSON.stringify(submission()),
      });
      h.loop.fail('fake-run-1', 'the model went away');
      const { body } = await call<GetImproveRunResponse>(
        `${h.url}/sessions/${sessionId}/improve/fake-run-1`,
      );
      expect(body.data).toMatchObject({
        status: 'failed',
        error: 'the model went away',
        iterations: [],
        baseRevisionId: started.body.data.revision.id,
      });
      const read = await call<GetRevisionResponse>(
        `${h.url}/revisions/${started.body.data.revision.id}`,
      );
      expect(read.body.data.evaluation?.status).toBe('failed');
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(1);
    });

    it('404s for an unknown revision, a run the loop lost, and a revision graded before delegation', async () => {
      const { sessionId } = await startSession();
      expect((await evaluation(UNKNOWN_UUID)).status).toBe(404);

      const { body: created } = await submit(sessionId, submission());
      h.loop.runs.delete('fake-run-1');
      expect((await evaluation(created.data.id)).status).toBe(404);

      const fork = h.em.fork();
      const legacy = fork.create(DesignRevision, {
        session: fork.getReference(DesignSession, sessionId),
        revisionNumber: 99,
        origin: 'user',
        graph: validGraph(),
        brief: null,
        narrative: null,
      });
      fork.persist(legacy);
      await fork.flush();
      expect((await evaluation(legacy.id)).status).toBe(404);
      const read = await call<GetRevisionResponse>(`${h.url}/revisions/${legacy.id}`);
      expect(read.body.data.evaluation).toBeNull();
    });
  });

  describe('the coach', () => {
    const startImprove = (sessionId: string, body: unknown) =>
      call<StartImproveResponse>(`${h.url}/sessions/${sessionId}/improve`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    const readImprove = (sessionId: string, runId: string) =>
      call<GetImproveRunResponse>(`${h.url}/sessions/${sessionId}/improve/${runId}`);

    it('[DEL-3] the draft becomes the author’s revision, and each iteration that beat every earlier one is imported once as the coach’s', async () => {
      const { prompt, sessionId } = await startSession();

      const started = await startImprove(sessionId, { ...submission(), maxIterations: 3 });
      expect(started.status).toBe(202);
      expect(started.body.data.runId).toBe('fake-run-1');
      expect(started.body.data.revision).toMatchObject({
        revisionNumber: 1,
        origin: 'user',
        evaluation: { runId: 'fake-run-1', iteration: 1, status: 'running' },
      });
      expect(h.loop.startRequests[0]).toMatchObject({
        pipeline: 'system-design-canvas',
        criteria: prompt.criteria,
        maxIterations: 3,
      });

      h.loop.exchanges('fake-run-1', 5);
      const running = await readImprove(sessionId, 'fake-run-1');
      expect(running.body.data).toMatchObject({
        runId: 'fake-run-1',
        sessionId,
        status: 'running',
        exchangeCount: 5,
        iterations: [],
        stopReason: null,
      });

      h.loop.complete('fake-run-1', [
        { overall: 60, decision: 'revise' },
        { overall: 72, decision: 'revise', artifact: coached() },
        { overall: 70, decision: 'revise', artifact: coached() },
      ]);
      const done = await readImprove(sessionId, 'fake-run-1');
      expect(done.body.data).toMatchObject({ status: 'complete', stopReason: 'max-iterations' });
      expect(done.body.data).toMatchObject({
        baseRevisionId: started.body.data.revision.id,
        maxIterations: 3,
      });
      const [first, second, third] = done.body.data.iterations;
      expect(first).toMatchObject({
        iteration: 1,
        mode: 'provided',
        overall: 60,
        decision: 'revise',
        reason: 'fake',
        outcome: 'base',
        problems: [],
      });
      expect(first.revisionId).toBe(started.body.data.revision.id);
      expect(second).toMatchObject({
        iteration: 2,
        mode: 'revise',
        overall: 72,
        outcome: 'imported',
      });
      expect(second.revisionId).not.toBeNull();
      expect(third).toMatchObject({
        iteration: 3,
        overall: 70,
        outcome: 'not-better',
        revisionId: null,
      });

      // Imported once: a second read answers the same revision.
      const again = await readImprove(sessionId, 'fake-run-1');
      expect(again.body.data.iterations[1].revisionId).toBe(second.revisionId);

      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(2);
      expect(list.body.data[0]).toMatchObject({
        revisionNumber: 2,
        origin: 'assistant',
        evaluation: {
          runId: 'fake-run-1',
          iteration: 2,
          status: 'complete',
          overall: 72,
          decision: 'revise',
        },
      });
      expect(list.body.data[1]).toMatchObject({
        revisionNumber: 1,
        origin: 'user',
        evaluation: { iteration: 1, status: 'complete', overall: 60 },
      });
      const imported = await call<GetRevisionResponse>(`${h.url}/revisions/${second.revisionId}`);
      expect(imported.body.data.graph.nodes.map((n) => n.id)).toContain('ai-replica');
    });

    it('[DEL-3] an iteration whose artifact the studio would refuse is reported refused with its problems, never stored', async () => {
      const { sessionId } = await startSession();
      await startImprove(sessionId, submission());
      expect(h.loop.startRequests[0]?.maxIterations).toBe(DEFAULT_IMPROVE_ITERATIONS);

      const dangling = coached();
      dangling.graph.edges.push({ id: 'ai-bad', source: 'api', target: 'nowhere', kind: 'sync' });
      h.loop.complete('fake-run-1', [
        { overall: 40 },
        { overall: 90, artifact: dangling },
        { overall: 95, artifact: { nope: true } },
      ]);
      const { body } = await readImprove(sessionId, 'fake-run-1');
      expect(body.data.iterations.map((it) => it.revisionId === null)).toEqual([false, true, true]);
      expect(body.data.iterations.map((it) => it.outcome)).toEqual(['base', 'refused', 'refused']);
      expect(body.data.iterations[1].problems.join('; ')).toMatch(/nowhere/);
      expect(body.data.iterations[2].problems).toEqual(['the artifact is not a submission']);
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(1);
      // A second read answers the same, and still stores nothing.
      const again = await readImprove(sessionId, 'fake-run-1');
      expect(again.body.data.iterations.map((it) => it.outcome)).toEqual([
        'base',
        'refused',
        'refused',
      ]);
    });

    it('[DEL-3] a graded revision is adopted as the run’s first iteration: nothing is graded or stored twice, and the draft is untouched', async () => {
      const { sessionId } = await startSession();
      const { body: graded } = await submit(sessionId, submission());
      h.loop.complete('fake-run-1');
      await call(`${h.url}/sessions/${sessionId}/draft`, {
        method: 'PUT',
        body: JSON.stringify(draft()),
      });

      const started = await startImprove(sessionId, {
        baseRevisionId: graded.data.id,
        maxIterations: 2,
      });
      expect(started.status).toBe(202);
      expect(started.body.data.runId).toBe('fake-run-2');
      expect(started.body.data.revision.id).toBe(graded.data.id);
      expect(h.loop.startRequests[1]).toEqual({
        pipeline: 'system-design-canvas',
        goal: expect.any(String),
        criteria: expect.any(Array),
        maxIterations: 2,
        adopt: { runId: 'fake-run-1', iteration: 1 },
      });
      expect(h.loop.startRequests[1]).not.toHaveProperty('output');
      const draftAfter = await call<GetSessionDraftResponse>(
        `${h.url}/sessions/${sessionId}/draft`,
      );
      expect(draftAfter.body.data).toEqual(draft());

      h.loop.complete('fake-run-2', [{ overall: 80, decision: 'revise', artifact: coached() }]);
      const done = await readImprove(sessionId, 'fake-run-2');
      expect(done.body.data).toMatchObject({
        status: 'complete',
        baseRevisionId: graded.data.id,
        maxIterations: 2,
      });
      const [first, second] = done.body.data.iterations;
      expect(first).toMatchObject({
        iteration: 1,
        mode: 'adopted',
        overall: 64,
        decision: 'revise',
        outcome: 'base',
        revisionId: graded.data.id,
      });
      expect(second).toMatchObject({
        iteration: 2,
        mode: 'revise',
        overall: 80,
        outcome: 'imported',
      });

      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(2);
      expect(list.body.data.map((r) => [r.revisionNumber, r.origin])).toEqual([
        [2, 'assistant'],
        [1, 'user'],
      ]);
      // The adopted base keeps the grade of the run it came from.
      expect(list.body.data[1].evaluation).toMatchObject({
        runId: 'fake-run-1',
        iteration: 1,
        status: 'complete',
        overall: 64,
      });
    });

    it('[DEL-3] a failed adopting run leaves the adopted revision’s grade alone', async () => {
      const { sessionId } = await startSession();
      const { body: graded } = await submit(sessionId, submission());
      h.loop.complete('fake-run-1');
      await startImprove(sessionId, { baseRevisionId: graded.data.id });
      h.loop.fail('fake-run-2', 'the model went away');

      const { body } = await readImprove(sessionId, 'fake-run-2');
      expect(body.data).toMatchObject({
        status: 'failed',
        iterations: [],
        error: 'the model went away',
      });
      const read = await call<GetRevisionResponse>(`${h.url}/revisions/${graded.data.id}`);
      expect(read.body.data.evaluation).toMatchObject({ status: 'complete', overall: 64 });
    });

    it('[DEL-3] only a completed grade of this session can be adopted: 404 for another session’s, 409 while running, 422 failed or graded before delegation', async () => {
      const { sessionId } = await startSession();
      const other = await startSession();
      const { body: foreign } = await submit(other.sessionId, submission());
      const { body: running } = await submit(sessionId, submission());
      const requests = h.loop.startRequests.length;

      const notMine = await startImprove(sessionId, { baseRevisionId: foreign.data.id });
      expect(notMine.status).toBe(404);
      const inFlight = await startImprove(sessionId, { baseRevisionId: running.data.id });
      expect(inFlight.status).toBe(409);

      h.loop.fail('fake-run-2', 'boom');
      const failed = await startImprove(sessionId, { baseRevisionId: running.data.id });
      expect(failed.status).toBe(422);
      expect(JSON.stringify((failed.body as unknown as ApiErrorResponse).message)).toMatch(
        /failed/,
      );

      const fork = h.em.fork();
      const legacy = fork.create(DesignRevision, {
        session: fork.getReference(DesignSession, sessionId),
        revisionNumber: 99,
        origin: 'user',
        graph: validGraph(),
        brief: null,
        narrative: null,
      });
      fork.persist(legacy);
      await fork.flush();
      const undelegated = await startImprove(sessionId, { baseRevisionId: legacy.id });
      expect(undelegated.status).toBe(422);
      expect((await startImprove(sessionId, { baseRevisionId: 'nope' })).status).toBe(400);
      expect(h.loop.startRequests).toHaveLength(requests);
    });

    it('[DEL-3] every coaching run is listed on its session newest first, whatever became of it', async () => {
      const { sessionId } = await startSession();
      expect(
        (await call<ListCoachingRunsResponse>(`${h.url}/sessions/${UNKNOWN_UUID}/improve`)).status,
      ).toBe(404);
      const empty = await call<ListCoachingRunsResponse>(`${h.url}/sessions/${sessionId}/improve`);
      expect(empty.body.data).toEqual([]);

      const first = await startImprove(sessionId, { ...submission(), maxIterations: 2 });
      h.loop.fail('fake-run-1', 'boom');
      await readImprove(sessionId, 'fake-run-1');
      const { body: graded } = await submit(sessionId, submission());
      h.loop.complete('fake-run-2');
      const second = await startImprove(sessionId, { baseRevisionId: graded.data.id });

      const { body } = await call<ListCoachingRunsResponse>(
        `${h.url}/sessions/${sessionId}/improve`,
      );
      expect(body.data).toEqual([
        {
          runId: 'fake-run-3',
          baseRevisionId: graded.data.id,
          maxIterations: DEFAULT_IMPROVE_ITERATIONS,
          startedAt: expect.any(String),
        },
        {
          runId: 'fake-run-1',
          baseRevisionId: first.body.data.revision.id,
          maxIterations: 2,
          startedAt: expect.any(String),
        },
      ]);
      expect(second.body.data.runId).toBe('fake-run-3');
    });

    it('[DEL-3] two polls of a finished run at once import each better iteration exactly once', async () => {
      const { sessionId } = await startSession();
      await startImprove(sessionId, submission());
      h.loop.complete('fake-run-1', [
        { overall: 40 },
        { overall: 70, artifact: coached() },
        { overall: 90, artifact: coached() },
      ]);

      const [a, b] = await Promise.all([
        readImprove(sessionId, 'fake-run-1'),
        readImprove(sessionId, 'fake-run-1'),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      const ids = (r: typeof a) => r.body.data.iterations.map((it) => it.revisionId);
      expect(ids(a)).toEqual(ids(b));
      expect(ids(a).every((id) => id !== null)).toBe(true);
      expect(a.body.data.iterations.map((it) => it.outcome)).toEqual([
        'base',
        'imported',
        'imported',
      ]);
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(3);
      expect(list.body.data.map((r) => r.revisionNumber)).toEqual([3, 2, 1]);
    });

    it('404s for a run that is not this session’s, 400 for more iterations than the loop allows', async () => {
      const { sessionId } = await startSession();
      await startImprove(sessionId, submission());
      const other = await startSession();
      expect((await readImprove(other.sessionId, 'fake-run-1')).status).toBe(404);
      expect((await readImprove(sessionId, 'nope')).status).toBe(404);
      expect((await startImprove(sessionId, { ...submission(), maxIterations: 11 })).status).toBe(
        400,
      );
    });
  });

  describe('the draft', () => {
    const putDraft = (sessionId: string, body: unknown) =>
      call(`${h.url}/sessions/${sessionId}/draft`, { method: 'PUT', body: JSON.stringify(body) });
    const getDraft = (sessionId: string) =>
      call<GetSessionDraftResponse>(`${h.url}/sessions/${sessionId}/draft`);

    it('[UX-15] the unsubmitted canvas is kept with the session, shape-checked only, and cleared by the submit it became', async () => {
      const { sessionId } = await startSession();
      expect((await getDraft(sessionId)).body.data).toBeNull();

      expect((await putDraft(sessionId, draft())).status).toBe(204);
      expect((await getDraft(sessionId)).body.data).toEqual(draft());
      const session = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
      expect(session.body.data.draft).toEqual(draft());

      await submit(sessionId, submission());
      expect((await getDraft(sessionId)).body.data).toBeNull();
    });

    it('[UX-15] a coach started from the draft clears it; a closed session keeps none; the shape is still the canvas’s', async () => {
      const { sessionId } = await startSession();
      await putDraft(sessionId, draft());
      const coach = await call<StartImproveResponse>(`${h.url}/sessions/${sessionId}/improve`, {
        method: 'POST',
        body: JSON.stringify(submission()),
      });
      expect(coach.status).toBe(202);
      expect((await getDraft(sessionId)).body.data).toBeNull();

      const malformed = {
        ...draft(),
        graph: { nodes: [{ id: 'x', kind: 'teapot', label: 'x' }], edges: [] },
      };
      expect((await putDraft(sessionId, malformed)).status).toBe(400);
      expect((await putDraft(sessionId, { ...draft(), extra: 1 })).status).toBe(400);

      await call(`${h.url}/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });
      expect((await putDraft(sessionId, draft())).status).toBe(422);
      expect((await putDraft(UNKNOWN_UUID, draft())).status).toBe(404);
      expect((await getDraft(UNKNOWN_UUID)).status).toBe(404);
    });
  });

  describe('lists and status', () => {
    it('lists graph-free summaries newest first, and summarises the newest revision on the session', async () => {
      const { sessionId } = await startSession();
      await submit(sessionId, submission(validGraph(), null, validNarrative('v1')));
      h.loop.complete('fake-run-1');
      await submit(sessionId, submission(validGraph(), null, validNarrative('v2')));

      const { status, body } = await call<ListRevisionsResponse>(
        `${h.url}/sessions/${sessionId}/revisions`,
      );
      expect(status).toBe(200);
      expect(body.meta.total).toBe(2);
      expect(body.data.map((r) => r.revisionNumber)).toEqual([2, 1]);
      expect(body.data[0]).not.toHaveProperty('graph');
      expect(body.data[0].evaluation).toEqual({
        runId: 'fake-run-2',
        iteration: 1,
        status: 'running',
        overall: null,
        decision: null,
      });

      const sessions = await call<ListSessionsResponse>(`${h.url}/sessions`);
      expect(sessions.body.data[0]).toMatchObject({
        id: sessionId,
        revisionCount: 2,
        latestRevisionNumber: 2,
        latestEvaluationStatus: 'running',
      });
    });

    it('filters sessions by promptId', async () => {
      const a = await startSession();
      await startSession();
      const { body } = await call<ListSessionsResponse>(
        `${h.url}/sessions?promptId=${a.prompt.id}`,
      );
      expect(body.meta.total).toBe(1);
      expect(body.data[0]?.promptId).toBe(a.prompt.id);
    });

    it('updates the session status, 404 for an unknown session', async () => {
      const { sessionId } = await startSession();
      const { status, body } = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'abandoned' }),
      });
      expect(status).toBe(200);
      expect(body.data.status).toBe('abandoned');
      const missing = await call(`${h.url}/sessions/${UNKNOWN_UUID}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });
      expect(missing.status).toBe(404);
    });
  });
});
