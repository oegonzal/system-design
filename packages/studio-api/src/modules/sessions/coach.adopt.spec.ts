import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMPROVE_ITERATIONS,
  describeUnassessedBase,
  type ApiErrorResponse,
  type GetRevisionResponse,
  type GetSessionDraftResponse,
  type GetSessionResponse,
  type ListCoachingRunsResponse,
  type ListRevisionsResponse,
} from '@sysdesign/contracts';
import { DesignRevision, DesignSession } from '@sysdesign/db';

import { call, UNKNOWN_UUID, useHarness } from '../../test/harness';
import { coached, draft, sessionsApi, submission, validGraph } from '../../test/sessions';

describe('the coach', () => {
  const h = useHarness();
  const { startSession, submit, startImprove, readImprove, evaluation } = sessionsApi(h);

  describe('adopting a grade, and holding the session', () => {
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
        recall: true,
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

    it('[DEL-11] an aim rides on the coaching run as the loop’s raised bar, is reported on the run, and is validated', async () => {
      const { sessionId } = await startSession();
      const graded = await submit(sessionId, submission());
      h.loop.complete('fake-run-1', [{ overall: 78, decision: 'accept' }]);
      await evaluation(graded.body.data.id);

      const started = await startImprove(sessionId, {
        baseRevisionId: graded.body.data.id,
        maxIterations: 2,
        aim: 90,
      });
      expect(started.status).toBe(202);
      expect(h.loop.startRequests.at(-1)).toMatchObject({
        adopt: { runId: 'fake-run-1', iteration: 1 },
        acceptAt: 90,
        maxIterations: 2,
      });
      const read = await readImprove(sessionId, started.body.data.runId);
      expect(read.body.data.aim).toBe(90);

      const over = await startImprove(sessionId, { baseRevisionId: graded.body.data.id, aim: 101 });
      expect(over.status).toBe(400);
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

    it('[UX-18] the coach refuses to start from a grade that assessed too little, and says why', async () => {
      const { sessionId } = await startSession();
      const { body: graded } = await submit(sessionId, submission());
      h.loop.complete('fake-run-1', [
        { overall: 0, decision: 'escalate', evidenceSufficient: false },
      ]);
      const requests = h.loop.startRequests.length;

      const refused = await startImprove(sessionId, { baseRevisionId: graded.data.id });
      expect(refused.status).toBe(409);
      expect((refused.body as unknown as ApiErrorResponse).message).toBe(describeUnassessedBase(1));
      expect(h.loop.startRequests).toHaveLength(requests);
      const runs = await call<ListCoachingRunsResponse>(`${h.url}/sessions/${sessionId}/improve`);
      expect(runs.body.data).toEqual([]);
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

    it('[DEL-3] a coach in flight holds the session — adopted or from the draft: no submit and no second coach until it ends, and the session says why', async () => {
      const { sessionId } = await startSession();
      const { body: graded } = await submit(sessionId, submission());
      h.loop.complete('fake-run-1');
      // Adopting stores no running revision: only the coaching run holds the slot.
      await startImprove(sessionId, { baseRevisionId: graded.data.id, maxIterations: 2 });

      const held = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
      expect(held.body.data.inFlight).toEqual({
        kind: 'coach',
        runId: 'fake-run-2',
        revisionNumber: 1,
        state: 'running',
      });
      const refusal = 'The coach is still revising from revision #1 — wait for it to finish.';
      const submitted = await submit(sessionId, submission());
      expect(submitted.status).toBe(409);
      expect((submitted.body as unknown as ApiErrorResponse).message).toBe(refusal);
      const again = await startImprove(sessionId, { baseRevisionId: graded.data.id });
      expect(again.status).toBe(409);
      expect((again.body as unknown as ApiErrorResponse).message).toBe(refusal);
      const fromDraft = await startImprove(sessionId, submission());
      expect(fromDraft.status).toBe(409);
      expect(h.loop.startRequests).toHaveLength(2);

      // Its first iteration is recorded, but the run is still revising: still held.
      h.loop.progress('fake-run-2');
      expect((await submit(sessionId, submission())).status).toBe(409);

      h.loop.complete('fake-run-2', [{ overall: 70, artifact: coached() }]);
      const free = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
      expect(free.body.data.inFlight).toBeNull();
      expect((await submit(sessionId, submission())).status).toBe(201);
    });
  });
});
