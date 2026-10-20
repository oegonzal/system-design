import { describe, expect, it } from 'vitest';
import {
  describeLostGrade,
  type ApiErrorResponse,
  type GetImproveRunResponse,
  type GetRevisionResponse,
  type GetSessionResponse,
  type ListRevisionsResponse,
  type ListSessionsResponse,
  type StartImproveResponse,
} from '@sysdesign/contracts';
import { DesignRevision, DesignSession } from '@sysdesign/db';

import { call, UNKNOWN_UUID, useHarness } from '../../test/harness';
import { sessionsApi, submission, validGraph } from '../../test/sessions';

describe('revisions', () => {
  const h = useHarness();
  const { startSession, submit, evaluation } = sessionsApi(h);

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
        dimensions: { coverage: 70, qualities: 52, compliance: 100 },
        // A plain grade ends on its one iteration; that is not a stop worth telling.
        stopReason: null,
      });
      expect(done.body.data.findings).toEqual([
        {
          id: 'unhandled_failure|node.2',
          lenses: ['critic.structure', 'critic.fitness'],
          type: 'unhandled_failure',
          severity: 'high',
          confidence: 'high',
          fixability: 'fixable_local',
          criterionIds: ['c2'],
          locations: [
            { ref: 'node.2', label: 'api · service · API', part: 'node', key: 'api', name: 'API' },
          ],
          mentions: [],
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
        'c6:fail',
        'c7:fail',
        'c8:fail',
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

    it('a failed run is reported failed with its error, cached as failed on the revision, and a new submit is still a new revision on a fresh run', async () => {
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

    // A workspace polls a session, its revision and the revision's grade side
    // by side. When one of them is gone it must be able to tell which without
    // reading a sentence: every 404 has one shape and names what is missing.
    it('every not-found has one shape and names what is missing: the revision for a grade whose revision is gone, the evaluation for a revision that has no grade to read', async () => {
      const { sessionId } = await startSession();
      const missing = async (path: string) => {
        const { status, body } = await call<ApiErrorResponse>(`${h.url}${path}`);
        expect(body).toEqual({
          statusCode: 404,
          error: 'Not Found',
          message: expect.any(String),
          missing: expect.any(String),
        });
        return `${status} ${body.missing}`;
      };
      expect(await missing(`/sessions/${UNKNOWN_UUID}`)).toBe('404 session');
      expect(await missing(`/sessions/${UNKNOWN_UUID}/draft`)).toBe('404 session');
      expect(await missing(`/sessions/${UNKNOWN_UUID}/revisions`)).toBe('404 session');
      expect(await missing(`/sessions/${UNKNOWN_UUID}/improve`)).toBe('404 session');
      expect(await missing(`/revisions/${UNKNOWN_UUID}`)).toBe('404 revision');
      // The grade of a revision that is gone says the same thing the revision does.
      expect(await missing(`/revisions/${UNKNOWN_UUID}/evaluation`)).toBe('404 revision');
      expect(await missing(`/sessions/${sessionId}/improve/no-such-run`)).toBe('404 coaching-run');
      // A coaching run under a session that is gone is the session's 404, like every read under it.
      expect(await missing(`/sessions/${UNKNOWN_UUID}/improve/no-such-run`)).toBe('404 session');

      const { body: created } = await submit(sessionId, submission());
      h.loop.forget('fake-run-1');
      expect(await missing(`/revisions/${created.data.id}/evaluation`)).toBe('404 evaluation');
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
      expect(await missing(`/revisions/${legacy.id}/evaluation`)).toBe('404 evaluation');
      const read = await call<GetRevisionResponse>(`${h.url}/revisions/${legacy.id}`);
      expect(read.body.data.evaluation).toBeNull();
    });
  });

  describe('a run the loop no longer has', () => {
    it('[DEL-3] holds nothing: the session reads with nothing in flight, takes the next submit, and the coach is refused a grade it cannot adopt', async () => {
      const { sessionId } = await startSession();
      const { body: graded } = await submit(sessionId, submission());
      h.loop.forget('fake-run-1');

      const read = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
      expect(read.status).toBe(200);
      expect(read.body.data.inFlight).toBeNull();
      // Nothing is grading it: the grade awaited is recorded as one that did
      // not arrive, with why in the author's terms, so no list says "grading…".
      expect(read.body.data.latestEvaluationStatus).toBe('failed');
      const revision = await call<GetRevisionResponse>(`${h.url}/revisions/${graded.data.id}`);
      expect(revision.body.data.evaluation).toEqual({
        runId: 'fake-run-1',
        iteration: 1,
        status: 'failed',
        overall: null,
        decision: null,
        error: describeLostGrade(1),
      });

      const coach = await call<StartImproveResponse>(`${h.url}/sessions/${sessionId}/improve`, {
        method: 'POST',
        body: JSON.stringify({ baseRevisionId: graded.data.id }),
      });
      expect(coach.status).toBe(422);
      expect(JSON.stringify((coach.body as unknown as ApiErrorResponse).message)).toContain(
        'is unknown to the grader',
      );

      const next = await submit(sessionId, submission());
      expect(next.status).toBe(201);
      expect(next.body.data).toMatchObject({
        revisionNumber: 2,
        evaluation: { runId: 'fake-run-2', status: 'running' },
      });
    });
  });
});
