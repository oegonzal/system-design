import { describe, expect, it, vi } from 'vitest';
import {
  PROMPT_COPY,
  type ApiErrorResponse,
  type GetSessionDraftResponse,
  type GetSessionResponse,
  type ListRevisionsResponse,
  type ListSessionsResponse,
  type StartImproveResponse,
} from '@sysdesign/contracts';
import { DesignRevision } from '@sysdesign/db';

import { call, UNKNOWN_UUID, useHarness } from '../../test/harness';
import {
  draft,
  sessionsApi,
  submission,
  unassessedIteration,
  validGraph,
  validNarrative,
} from '../../test/sessions';

describe('sessions', () => {
  const h = useHarness();
  const { makePrompt, createSession, startSession, submit } = sessionsApi(h);

  describe('POST /api/sessions', () => {
    it('creates an in-progress session with no grade yet', async () => {
      const prompt = await makePrompt();
      const { status, body } = await createSession(prompt.id);

      expect(status).toBe(201);
      expect(body.data).toMatchObject({
        promptId: prompt.id,
        promptTitle: prompt.title,
        status: 'in-progress',
        revisionCount: 0,
        latestRevisionNumber: null,
        latestOverall: null,
        latestDecision: null,
        latestEvaluationStatus: null,
        inFlight: null,
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
      // The studio's own words ("Unarchive"), shared with the page through the contract.
      expect(archived.body.message).toBe(PROMPT_COPY.archived);
      expect((await createSession(UNKNOWN_UUID)).status).toBe(422);
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

    it('[UX-15] a coach started from the draft clears it; a closed session keeps none; the shape is still the canvas’s, and only a fault of shape is refused', async () => {
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
      const refused = await putDraft(sessionId, malformed);
      expect(refused.status).toBe(400);
      expect((refused.body as ApiErrorResponse).issues).toEqual([
        { path: 'graph.nodes.0.kind', message: expect.any(String) },
      ]);
      // An aside the canvas does not know is no fault of shape: dropped, the rest kept.
      expect((await putDraft(sessionId, { ...draft(), extra: 1 })).status).toBe(204);
      expect((await getDraft(sessionId)).body.data).toEqual(draft());

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
        promptTitle: 'Serve a unified order history',
        revisionCount: 2,
        latestRevisionNumber: 2,
        latestEvaluationStatus: 'running',
      });
      // What holds the slot is a single session's to say: a list row never asks the grader.
      expect(sessions.body.data[0]).not.toHaveProperty('inFlight');
    });

    // A cache written before a grade that assessed too little stopped earning
    // a number: the controller's 0 and its escalation, as an older studio
    // stored them when it read the grade.
    const cacheAsBefore = (runId: string, overall: number) =>
      h.em
        .fork()
        .nativeUpdate(
          DesignRevision,
          { qualityRunId: runId },
          { evaluationStatus: 'complete', overall, decision: 'escalate' },
        );

    it('[UX-18] a standing cached before an unassessed grade stopped earning a number is brought up to date by the lists, each grade read once', async () => {
      const stale = await startSession();
      await submit(stale.sessionId, submission());
      h.loop.complete('fake-run-1', [unassessedIteration(stale.prompt.criteria)]);
      const verdict = await startSession();
      await submit(verdict.sessionId, submission());
      h.loop.complete('fake-run-2', [{ overall: 40, decision: 'escalate' }]);
      await cacheAsBefore('fake-run-1', 0);
      await cacheAsBefore('fake-run-2', 40);

      const reads = vi.spyOn(h.loop, 'getRun');
      try {
        const sessions = await call<ListSessionsResponse>(`${h.url}/sessions`);
        const row = (id: string) => sessions.body.data.find((session) => session.id === id);
        // No number, so no verdict: every surface reads it "not assessed".
        expect(row(stale.sessionId)).toMatchObject({
          latestOverall: null,
          latestDecision: 'escalate',
          latestEvaluationStatus: 'complete',
        });
        // An escalation that is a verdict keeps its number.
        expect(row(verdict.sessionId)).toMatchObject({
          latestOverall: 40,
          latestDecision: 'escalate',
        });
        expect(reads.mock.calls.map(([runId]) => runId).sort()).toEqual([
          'fake-run-1',
          'fake-run-2',
        ]);

        // Read once: no list, timeline or session read asks about either again.
        reads.mockClear();
        await call(`${h.url}/sessions`);
        const timeline = await call<ListRevisionsResponse>(
          `${h.url}/sessions/${stale.sessionId}/revisions`,
        );
        expect(timeline.body.data[0].evaluation).toMatchObject({
          overall: null,
          decision: 'escalate',
        });
        const session = await call<GetSessionResponse>(`${h.url}/sessions/${verdict.sessionId}`);
        expect(session.body.data.latestOverall).toBe(40);
        expect(reads).not.toHaveBeenCalled();
      } finally {
        reads.mockRestore();
      }
    });

    it('[UX-18] a list never waits on a grader that cannot answer to bring a standing up to date: it answers from the cache, and the next read does it', async () => {
      const { prompt, sessionId } = await startSession();
      await submit(sessionId, submission());
      h.loop.complete('fake-run-1', [unassessedIteration(prompt.criteria)]);
      await cacheAsBefore('fake-run-1', 0);

      h.loop.unreachable = true;
      const down = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(down.status).toBe(200);
      expect(down.body.data[0].evaluation).toMatchObject({ overall: 0, decision: 'escalate' });

      h.loop.unreachable = false;
      const up = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(up.body.data[0].evaluation).toMatchObject({ overall: null, decision: 'escalate' });
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
