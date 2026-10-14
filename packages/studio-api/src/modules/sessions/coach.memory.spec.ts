import { describe, expect, it } from 'vitest';
import { recallWithout } from '@sysdesign/contracts';
import { FAKE_RECALLED_LESSONS, fakeRecalled } from '@sysdesign/studio-testing';

import { call, useHarness } from '../../test/harness';
import { coached, sessionsApi, submission } from '../../test/sessions';

describe('the coach', () => {
  const h = useHarness();
  const { startSession, submit, evaluation, startImprove, readImprove } = sessionsApi(h);

  describe('what it recalls, and what it teaches', () => {
    // A coach run iterated, so its trace carries the transitions a digest can
    // reason over. It is the one studio run worth teaching the memory store,
    // and the moment it settles is the one moment to do it.
    it('[DEL-3] a coach run is handed to the memory orchestrator once, when it settles, and never while it runs', async () => {
      const { sessionId } = await startSession();
      await startImprove(sessionId, { ...submission(), maxIterations: 2 });

      await readImprove(sessionId, 'fake-run-1');
      expect(h.loop.digested).toEqual([]);

      h.loop.complete('fake-run-1', [
        { overall: 60, decision: 'revise' },
        { overall: 72, decision: 'revise', artifact: coached() },
      ]);
      await readImprove(sessionId, 'fake-run-1');
      expect(h.loop.digested).toEqual(['fake-run-1']);

      // The row records it, so a later poll teaches nothing twice.
      await readImprove(sessionId, 'fake-run-1');
      expect(h.loop.digested).toEqual(['fake-run-1']);
    });

    // The workspace polls the session every three seconds and the coach run
    // every one and a half, and both reads ask the loop and record a settled
    // status. Whichever lands first consumes the transition — so the hand-off
    // cannot hang off it.
    it('[DEL-3] a session read that settles the coach run first does not cost the hand-off', async () => {
      const { sessionId } = await startSession();
      await startImprove(sessionId, { ...submission(), maxIterations: 2 });

      h.loop.complete('fake-run-1', [
        { overall: 60, decision: 'revise' },
        { overall: 72, decision: 'revise', artifact: coached() },
      ]);
      await call(`${h.url}/sessions/${sessionId}`);
      expect(h.loop.digested).toEqual([]);

      await readImprove(sessionId, 'fake-run-1');
      expect(h.loop.digested).toEqual(['fake-run-1']);
    });

    // The page's clock is the author's machine's: a quiet run is judged
    // against the server's own instant, stamped as it read the run.
    it('[EVAL-1] stamps the server’s clock on a coach run and on its grade as it reads them', async () => {
      const { sessionId } = await startSession();
      const { body: started } = await startImprove(sessionId, {
        ...submission(),
        maxIterations: 2,
      });
      const before = Date.now();
      const coach = (await readImprove(sessionId, 'fake-run-1')).body.data;
      const grade = (await evaluation(started.data.revision.id)).body.data;
      const after = Date.now();
      for (const { readAt } of [coach, grade]) {
        expect(Date.parse(readAt)).toBeGreaterThanOrEqual(before);
        expect(Date.parse(readAt)).toBeLessThanOrEqual(after);
      }
    });

    it('[QL-32] every coach start recalls for its producer and says what it was handed; a grade never recalls', async () => {
      const { sessionId } = await startSession();
      // A grade: the author's submit asks for no lessons.
      await submit(sessionId, submission());
      expect(h.loop.startRequests[0]).not.toHaveProperty('recall');
      h.loop.complete('fake-run-1', [{ overall: 60, decision: 'revise' }]);

      // From the draft: the run asks to recall, and says so while it does.
      await startImprove(sessionId, { ...submission(), maxIterations: 2 });
      expect(h.loop.startRequests[1]).toMatchObject({ recall: true, output: submission() });
      const recalling = await readImprove(sessionId, 'fake-run-2');
      expect(recalling.body.data).toMatchObject({
        status: 'running',
        iterations: [],
        recall: { status: 'recalling', count: 0, lessons: [] },
      });

      // Once the lessons are in, the run reads them back with their provenance.
      h.loop.recall('fake-run-2');
      const recalled = await readImprove(sessionId, 'fake-run-2');
      expect(recalled.body.data.recall).toEqual(fakeRecalled('fake-run-2'));
      expect(recalled.body.data.recall?.lessons.map((lesson) => lesson.insight)).toEqual(
        FAKE_RECALLED_LESSONS.map((lesson) => lesson.insight),
      );

      // The lessons change nothing about how the run is read: it settles as any coach run does.
      h.loop.complete('fake-run-2', [
        { overall: 60, decision: 'revise' },
        { overall: 72, decision: 'revise', artifact: coached() },
      ]);
      const graded = (await readImprove(sessionId, 'fake-run-2')).body.data;
      expect(graded.status).toBe('complete');
      expect(graded.recall?.status).toBe('recalled');

      // From a graded revision: the adopting run asks to recall too, and a
      // recall that found nothing is said as such.
      const base = graded.iterations[1]?.revisionId ?? '';
      await startImprove(sessionId, { baseRevisionId: base, maxIterations: 2 });
      expect(h.loop.startRequests[2]).toMatchObject({ recall: true, adopt: { iteration: 2 } });
      h.loop.recall('fake-run-3', recallWithout('store-empty'));
      expect((await readImprove(sessionId, 'fake-run-3')).body.data.recall).toMatchObject({
        status: 'empty',
        reason: 'store-empty',
        count: 0,
      });
    });

    it('[QL-32] a coach with no iteration to revise in still asks to recall, and the loop says it skipped', async () => {
      const { sessionId } = await startSession();
      // One iteration over the draft: it is graded, never revised. The studio
      // asks anyway — whether a run can use lessons is the loop's call.
      await startImprove(sessionId, { ...submission(), maxIterations: 1 });
      expect(h.loop.startRequests[0]).toMatchObject({ recall: true, maxIterations: 1 });
      const read = await readImprove(sessionId, 'fake-run-1');
      expect(read.body.data.recall).toEqual(recallWithout('no-produce-iteration'));
    });

    it('[DEL-3] a failed coach run teaches nothing: it has no trace to digest', async () => {
      const { sessionId } = await startSession();
      await startImprove(sessionId, { ...submission(), maxIterations: 2 });

      h.loop.fail('fake-run-1', 'the model went away');
      const done = await readImprove(sessionId, 'fake-run-1');
      expect(done.body.data.status).toBe('failed');
      expect(h.loop.digested).toEqual([]);
    });
  });
});
