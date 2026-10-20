import { BadGatewayException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  describeInFlight,
  type ApiErrorResponse,
  type GetRevisionResponse,
  type GetSessionResponse,
  type ListRevisionsResponse,
} from '@sysdesign/contracts';
import { DesignRevision, DesignSession } from '@sysdesign/db';

import { call, UNKNOWN_UUID, useHarness } from '../../test/harness';
import {
  draft,
  sessionsApi,
  submission,
  unassessedIteration,
  validGraph,
} from '../../test/sessions';

describe('revisions', () => {
  const h = useHarness();
  const { startSession, submit, evaluation } = sessionsApi(h);

  describe('POST /api/revisions/:id/evaluation', () => {
    const regrade = (revisionId: string) =>
      call<GetRevisionResponse>(`${h.url}/revisions/${revisionId}/evaluation`, { method: 'POST' });

    it('[UX-17] a failed grade is run again in place: the same revision points at a fresh run of the stored design, and no revision is added', async () => {
      const { prompt, sessionId } = await startSession();
      const { body: created } = await submit(sessionId, submission());
      await call(`${h.url}/sessions/${sessionId}/draft`, {
        method: 'PUT',
        body: JSON.stringify(draft()),
      });
      h.loop.fail('fake-run-1', 'the model went away');
      expect((await evaluation(created.data.id)).body.data.status).toBe('failed');

      const again = await regrade(created.data.id);
      expect(again.status).toBe(202);
      expect(again.body.data).toMatchObject({
        id: created.data.id,
        revisionNumber: 1,
        origin: 'user',
        graph: created.data.graph,
        brief: created.data.brief,
        narrative: created.data.narrative,
        createdAt: created.data.createdAt,
        evaluation: {
          runId: 'fake-run-2',
          iteration: 1,
          status: 'running',
          overall: null,
          decision: null,
        },
      });
      // One more run, of the design as stored, judged once, on the prompt's rubric — a grade, so no recall.
      expect(h.loop.startRequests).toHaveLength(2);
      expect(h.loop.startRequests[1]).toMatchObject({
        pipeline: 'system-design-canvas',
        goal: prompt.markdown,
        criteria: prompt.criteria,
        maxIterations: 1,
        output: submission(),
      });
      expect(h.loop.startRequests[1].recall).toBeUndefined();

      // It holds the session's slot as any grade does, and the draft is left alone.
      const held = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
      expect(held.body.data).toMatchObject({
        revisionCount: 1,
        draft: draft(),
        inFlight: { kind: 'grade', runId: 'fake-run-2', revisionNumber: 1, state: 'running' },
      });
      expect((await submit(sessionId, submission())).status).toBe(409);

      h.loop.complete('fake-run-2');
      expect((await evaluation(created.data.id)).body.data).toMatchObject({
        runId: 'fake-run-2',
        status: 'complete',
        overall: 64,
      });
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(1);
      expect(list.body.data[0].evaluation).toMatchObject({
        runId: 'fake-run-2',
        status: 'complete',
        overall: 64,
        decision: 'revise',
      });
    });

    it('[UX-18] a grade that assessed too little is no verdict: it reads unscored, never 0, and is graded again in place', async () => {
      const { prompt, sessionId } = await startSession();
      const { body: created } = await submit(sessionId, submission());
      // Every lens sample failed: the evidence gate escalated with nothing assessed.
      h.loop.complete('fake-run-1', [unassessedIteration(prompt.criteria)]);
      const grade = (await evaluation(created.data.id)).body.data;
      expect(grade).toMatchObject({
        status: 'complete',
        overall: null,
        unscored: 'unassessed',
        decision: 'escalate',
        dimensions: { coverage: null, qualities: null, compliance: null },
        decisionBasis: { criteria: { assessed: 0, total: prompt.criteria.length } },
      });
      // The timeline's cache says the same: no number.
      const listed = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(listed.body.data[0].evaluation).toMatchObject({
        status: 'complete',
        overall: null,
        decision: 'escalate',
      });

      const again = await regrade(created.data.id);
      expect(again.status).toBe(202);
      expect(again.body.data).toMatchObject({
        id: created.data.id,
        evaluation: { runId: 'fake-run-2', iteration: 1, status: 'running', overall: null },
      });
      h.loop.complete('fake-run-2');
      expect((await evaluation(created.data.id)).body.data).toMatchObject({
        runId: 'fake-run-2',
        overall: 64,
        unscored: null,
      });
    });

    it('[UX-17] only a revision with no grade to keep is graded again: 409 while its grade runs or once it stands, 404 for no revision', async () => {
      const { sessionId } = await startSession();
      const { body: created } = await submit(sessionId, submission());

      const running = await regrade(created.data.id);
      expect(running.status).toBe(409);
      expect((running.body as unknown as ApiErrorResponse).message).toBe(
        describeInFlight({
          kind: 'grade',
          runId: 'fake-run-1',
          revisionNumber: 1,
          state: 'running',
        }),
      );

      h.loop.complete('fake-run-1');
      const graded = await regrade(created.data.id);
      expect(graded.status).toBe(409);
      expect((graded.body as unknown as ApiErrorResponse).message).toBe(
        'Revision #1 is already graded — its grade stands.',
      );
      expect(h.loop.startRequests).toHaveLength(1);

      const none = await regrade(UNKNOWN_UUID);
      expect(none.status).toBe(404);
      expect((none.body as unknown as ApiErrorResponse).missing).toBe('revision');
    });

    it('[UX-17] a grade the grader lost and a revision stored before delegation have no grade to keep either, and are graded where they stand', async () => {
      const { sessionId } = await startSession();
      const { body: created } = await submit(sessionId, submission());
      h.loop.forget('fake-run-1');
      // Read first, so the loss is on record — and the re-grade clears it.
      expect((await evaluation(created.data.id)).status).toBe(404);
      const lost = await regrade(created.data.id);
      expect(lost.status).toBe(202);
      expect(lost.body.data.evaluation).toEqual({
        runId: 'fake-run-2',
        iteration: 1,
        status: 'running',
        overall: null,
        decision: null,
      });
      h.loop.complete('fake-run-2');
      await evaluation(created.data.id);
      const regraded = await call<GetRevisionResponse>(`${h.url}/revisions/${created.data.id}`);
      expect(regraded.body.data.evaluation).toMatchObject({ status: 'complete', overall: 64 });
      expect(regraded.body.data.evaluation).not.toHaveProperty('error');

      const fork = h.em.fork();
      const legacy = fork.create(DesignRevision, {
        session: fork.getReference(DesignSession, sessionId),
        revisionNumber: 2,
        origin: 'user',
        graph: validGraph(),
        brief: null,
        narrative: null,
      });
      fork.persist(legacy);
      await fork.flush();
      const first = await regrade(legacy.id);
      expect(first.status).toBe(202);
      expect(first.body.data.evaluation).toMatchObject({
        runId: 'fake-run-3',
        iteration: 1,
        status: 'running',
      });
    });

    it('[UX-17] a re-grade is a submit in every other rule: refused for a closed session, while another run holds the session, and when the grader refuses — and nothing is repointed', async () => {
      const { sessionId } = await startSession();
      const { body: failed } = await submit(sessionId, submission());
      h.loop.fail('fake-run-1', 'the model went away');
      await evaluation(failed.data.id);

      // A later revision is being graded: the earlier, failed one waits its turn.
      await submit(sessionId, submission());
      const busy = await regrade(failed.data.id);
      expect(busy.status).toBe(409);
      expect((busy.body as unknown as ApiErrorResponse).message).toBe(
        describeInFlight({
          kind: 'grade',
          runId: 'fake-run-2',
          revisionNumber: 2,
          state: 'running',
        }),
      );
      h.loop.complete('fake-run-2');

      h.loop.failNextStart = new BadGatewayException('the quality loop refused the run');
      expect((await regrade(failed.data.id)).status).toBe(502);
      const untouched = await call<GetRevisionResponse>(`${h.url}/revisions/${failed.data.id}`);
      expect(untouched.body.data.evaluation).toMatchObject({
        runId: 'fake-run-1',
        status: 'failed',
      });

      // An earlier revision re-graded holds the slot though it is not the latest.
      expect((await regrade(failed.data.id)).status).toBe(202);
      const held = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
      expect(held.body.data.inFlight).toEqual({
        kind: 'grade',
        runId: 'fake-run-3',
        revisionNumber: 1,
        state: 'running',
      });
      expect((await submit(sessionId, submission())).status).toBe(409);
      h.loop.fail('fake-run-3', 'again');
      await evaluation(failed.data.id);

      await call(`${h.url}/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });
      expect((await regrade(failed.data.id)).status).toBe(422);
    });

    it('[UX-17] two re-grades at once are one run: the second finds the first in flight', async () => {
      const { sessionId } = await startSession();
      const { body: created } = await submit(sessionId, submission());
      h.loop.fail('fake-run-1', 'the model went away');
      await evaluation(created.data.id);

      const results = await Promise.all([regrade(created.data.id), regrade(created.data.id)]);
      expect(results.map((r) => r.status).sort()).toEqual([202, 409]);
      expect(h.loop.startRequests).toHaveLength(2);
      const read = await call<GetRevisionResponse>(`${h.url}/revisions/${created.data.id}`);
      expect(read.body.data.evaluation).toMatchObject({ runId: 'fake-run-2', status: 'running' });
    });
  });
});
