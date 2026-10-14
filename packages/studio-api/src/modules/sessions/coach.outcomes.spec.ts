import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  BINDING_CLAIM_BOUND,
  describeInFlight,
  NARRATION_OVERVIEW_BOUND,
  SOFT_ISSUE_NOTE,
  type ApiErrorResponse,
  type DesignSubmission,
  type SessionDraft,
  type GetRevisionResponse,
  type GetSessionDraftResponse,
  type GetSessionResponse,
  type ListRevisionsResponse,
} from '@sysdesign/contracts';
import { CoachingRun } from '@sysdesign/db';

import { call, useHarness } from '../../test/harness';
import {
  coached,
  prose,
  sessionsApi,
  submission,
  unassessedIteration,
  validBrief,
  validNarrative,
} from '../../test/sessions';

describe('the coach', () => {
  const h = useHarness();
  const { startSession, submit, evaluation, startImprove, readImprove } = sessionsApi(h);

  describe('each iteration’s outcome, while the run lasts and after', () => {
    it('[DEL-3] a session reads while the grader is down: a run its record says is running is in flight as unknown, an ended one is never asked about, and a write is still refused', async () => {
      const { sessionId } = await startSession();
      const session = () => call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
      const { body: graded } = await submit(sessionId, submission());

      // A grade in flight, the grader unreachable: the read answers, and says it cannot know.
      h.loop.unreachable = true;
      const unsure = await session();
      expect(unsure.status).toBe(200);
      const held = unsure.body.data.inFlight;
      expect(held).toEqual({
        kind: 'grade',
        runId: 'fake-run-1',
        revisionNumber: 1,
        state: 'unknown',
      });
      expect(held && describeInFlight(held)).toBe(
        'Revision #1 may still be being graded — the grader cannot be reached to say.',
      );
      // A write must know: asked under the lock, the unreachable grader refuses it.
      expect((await submit(sessionId, submission())).status).toBe(503);
      const patched = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in-progress' }),
      });
      expect(patched.status).toBe(200);
      expect(patched.body.data.inFlight?.state).toBe('unknown');

      // Back up, the grade ends; a coach then runs to its end and is recorded as ended.
      h.loop.unreachable = false;
      h.loop.complete('fake-run-1');
      await startImprove(sessionId, { baseRevisionId: graded.data.id, maxIterations: 2 });
      expect((await session()).body.data.inFlight).toMatchObject({
        kind: 'coach',
        state: 'running',
      });
      h.loop.unreachable = true;
      expect((await session()).body.data.inFlight).toMatchObject({
        kind: 'coach',
        runId: 'fake-run-2',
        state: 'unknown',
      });
      h.loop.unreachable = false;
      h.loop.complete('fake-run-2', [{ overall: 70, artifact: coached() }]);
      expect((await session()).body.data.inFlight).toBeNull();
      const coaching = await h.em.fork().findOneOrFail(CoachingRun, { runId: 'fake-run-2' });
      expect(coaching.status).toBe('complete');

      // Every run ended and recorded: the session reads without the grader at all.
      h.loop.unreachable = true;
      const ended = await session();
      expect(ended.status).toBe(200);
      expect(ended.body.data.inFlight).toBeNull();
      h.loop.unreachable = false;
    });

    it('[DEL-3] a running coach’s finished iterations are listed and imported as they land, and it stops only when the run does', async () => {
      const { sessionId } = await startSession();
      const started = await startImprove(sessionId, { ...submission(), maxIterations: 3 });
      const baseId = started.body.data.revision.id;

      h.loop.progress('fake-run-1', [{ overall: 60, decision: 'revise' }]);
      const first = await readImprove(sessionId, 'fake-run-1');
      expect(first.body.data).toMatchObject({ status: 'running', stopReason: null });
      expect(first.body.data.iterations).toEqual([
        expect.objectContaining({ iteration: 1, overall: 60, outcome: 'base', revisionId: baseId }),
      ]);
      // The base's grade is final once recorded, though the coach is still revising
      // — and not settled: whether it ends the run waits for the run.
      const base = await evaluation(baseId);
      expect(base.body.data).toMatchObject({
        status: 'complete',
        settled: false,
        overall: 60,
        stopReason: null,
      });

      h.loop.progress('fake-run-1', [
        { overall: 60, decision: 'revise' },
        { overall: 72, decision: 'revise', artifact: coached() },
      ]);
      const second = await readImprove(sessionId, 'fake-run-1');
      expect(second.body.data.status).toBe('running');
      expect(second.body.data.iterations[1]).toMatchObject({
        iteration: 2,
        overall: 72,
        outcome: 'imported',
      });
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.data[0]).toMatchObject({
        revisionNumber: 2,
        origin: 'assistant',
        evaluation: { iteration: 2, status: 'complete', overall: 72 },
      });

      h.loop.complete('fake-run-1', [
        { overall: 60, decision: 'revise' },
        { overall: 72, decision: 'revise', artifact: coached() },
        { overall: 70, decision: 'revise', artifact: coached() },
      ]);
      const done = await readImprove(sessionId, 'fake-run-1');
      expect(done.body.data).toMatchObject({ status: 'complete', stopReason: 'max-iterations' });
      expect(done.body.data.iterations[1].revisionId).toBe(
        second.body.data.iterations[1].revisionId,
      );
      // The base is not the iteration that ended the run: its grade carries no stop reason.
      expect((await evaluation(baseId)).body.data).toMatchObject({
        settled: true,
        stopReason: null,
      });
    });

    it('[DEL-4] a coach that fails after recording iterations keeps every grade the studio showed: the base and the import stay complete', async () => {
      const { sessionId } = await startSession();
      const started = await startImprove(sessionId, { ...submission(), maxIterations: 3 });
      const baseId = started.body.data.revision.id;
      h.loop.progress('fake-run-1', [
        { overall: 60, decision: 'revise' },
        { overall: 72, decision: 'revise', artifact: coached() },
      ]);
      const running = await readImprove(sessionId, 'fake-run-1');
      const importedId = running.body.data.iterations[1].revisionId;
      expect(importedId).not.toBeNull();

      h.loop.fail('fake-run-1', 'the model went away');
      const failed = await readImprove(sessionId, 'fake-run-1');
      expect(failed.body.data).toMatchObject({
        status: 'failed',
        stopReason: null,
        error: 'the model went away',
      });
      expect(failed.body.data.iterations.map((it) => it.revisionId)).toEqual([baseId, importedId]);
      expect((await evaluation(baseId)).body.data).toMatchObject({
        status: 'complete',
        settled: true,
        overall: 60,
        stopReason: null,
      });
      expect((await evaluation(importedId ?? '')).body.data).toMatchObject({
        status: 'complete',
        settled: true,
        overall: 72,
      });
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.data.map((revision) => revision.evaluation?.status)).toEqual([
        'complete',
        'complete',
      ]);
    });

    it('[DEL-3] an iteration with no artifact is its own outcome: unscored, never “not better”, never the design’s fault', async () => {
      const { prompt, sessionId } = await startSession();
      await startImprove(sessionId, { ...submission(), maxIterations: 2 });
      h.loop.complete('fake-run-1', [
        { overall: 12, decision: 'revise' },
        { overall: 0, decision: 'escalate', artifact: null },
      ]);
      const { body } = await readImprove(sessionId, 'fake-run-1');
      expect(body.data.iterations[1]).toEqual({
        iteration: 2,
        mode: 'revise',
        overall: null,
        unscored: 'no-artifact',
        decision: 'escalate',
        reason: 'fake',
        decisionBasis: {
          factor: null,
          facts: {},
          remediations: 0,
          criteria: { assessed: prompt.criteria.length, total: prompt.criteria.length },
        },
        findings: [],
        outcome: 'no-artifact',
        problems: [],
        revisionId: null,
      });
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(1);
    });

    it('[UX-18] an iteration the lenses could not assess is its own outcome: unscored, compared with nothing, never “not better”', async () => {
      const { prompt, sessionId } = await startSession();
      await startImprove(sessionId, { ...submission(), maxIterations: 3 });
      h.loop.complete('fake-run-1', [
        { overall: 58, decision: 'revise' },
        unassessedIteration(prompt.criteria, { artifact: coached() }),
        // A lower score after it is still held against the 58 it never beat.
        { overall: 40, decision: 'revise', artifact: coached() },
      ]);
      const { body } = await readImprove(sessionId, 'fake-run-1');
      const [, unassessed, lower] = body.data.iterations;
      expect(unassessed).toMatchObject({
        iteration: 2,
        overall: null,
        unscored: 'unassessed',
        decision: 'escalate',
        outcome: 'unassessed',
        problems: [],
        revisionId: null,
      });
      expect(lower).toMatchObject({ iteration: 3, overall: 40, outcome: 'not-better' });
      const list = await call<ListRevisionsResponse>(`${h.url}/sessions/${sessionId}/revisions`);
      expect(list.body.meta.total).toBe(1);
    });

    it('[UX-20] an iteration that wrote past its bounds imports whole — past the ask and past the ceiling — with the overruns logged, re-saves as the draft, and a submit of it is still held to the ceilings', async () => {
      const { sessionId } = await startSession();
      await startImprove(sessionId, submission());
      // The measured overruns, against today's bounds: an overview a little
      // past `NARRATION_OVERVIEW_BOUND.target` and within its ceiling, and a
      // claim past `BINDING_CLAIM_BOUND.ceiling` — short of the three targets
      // past which the loop would have cut it.
      const overview = prose(NARRATION_OVERVIEW_BOUND.target + 38);
      const claim = prose(BINDING_CLAIM_BOUND.ceiling + 45);
      const [first, second] = validBrief().bindings;
      const wordy: DesignSubmission = {
        ...coached(),
        brief: { version: 1, bindings: [{ ...first, claim }, second] },
        narrative: { ...validNarrative(), overview },
      };
      const logged = vi.spyOn(Logger.prototype, 'log');
      h.loop.complete('fake-run-1', [{ overall: 40 }, { overall: 72, artifact: wordy }]);
      const { body } = await readImprove(sessionId, 'fake-run-1');
      expect(body.data.iterations.map((it) => it.outcome)).toEqual(['base', 'imported']);
      const imported = await call<GetRevisionResponse>(
        `${h.url}/revisions/${body.data.iterations[1].revisionId}`,
      );
      expect(imported.body.data.brief?.bindings[0]?.claim).toBe(claim);
      expect(imported.body.data.narrative?.overview).toBe(overview);
      // In the one wording every size fault has — the loop's diagnostics and warnings say the same.
      const grouped = (n: number) => n.toLocaleString('en-US');
      const { target, ceiling } = BINDING_CLAIM_BOUND;
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining(
          `brief.bindings[0].claim: ${claim.length} characters; ${target} asked, ${ceiling} accepted ${SOFT_ISSUE_NOTE}`,
        ),
      );
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining(
          `narrative.overview: ${grouped(overview.length)} characters; ${grouped(NARRATION_OVERVIEW_BOUND.target)} asked, ${grouped(NARRATION_OVERVIEW_BOUND.ceiling)} accepted ${SOFT_ISSUE_NOTE}`,
        ),
      );
      logged.mockRestore();

      // Restored as the draft, it saves as written and reads back whole.
      const { graph, brief, narrative } = imported.body.data;
      const restored: SessionDraft = { graph, brief, narrative };
      const saved = await call(`${h.url}/sessions/${sessionId}/draft`, {
        method: 'PUT',
        body: JSON.stringify(restored),
      });
      expect(saved.status).toBe(204);
      const draftRead = await call<GetSessionDraftResponse>(`${h.url}/sessions/${sessionId}/draft`);
      expect(draftRead.body.data?.brief?.bindings[0]?.claim).toBe(claim);

      // Submitted, it is held to the ceiling, naming the one field past it.
      const submitted = await call<ApiErrorResponse>(`${h.url}/sessions/${sessionId}/revisions`, {
        method: 'POST',
        body: JSON.stringify(restored),
      });
      expect(submitted.status).toBe(400);
      expect(submitted.body.issues?.map((issue) => issue.path)).toEqual(['brief.bindings.0.claim']);
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
});
