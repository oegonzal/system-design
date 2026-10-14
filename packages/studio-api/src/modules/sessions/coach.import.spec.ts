import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMPROVE_ITERATIONS,
  LAYOUT_PITCH,
  type CanvasGraph,
  type ConfirmedFinding,
  type DesignSubmission,
  type GetRevisionResponse,
  type ListRevisionsResponse,
} from '@sysdesign/contracts';

import { call, useHarness } from '../../test/harness';
import { coached, sessionsApi, submission, validGraph } from '../../test/sessions';

describe('the coach', () => {
  const h = useHarness();
  const { startSession, startImprove, readImprove } = sessionsApi(h);

  describe('importing its iterations', () => {
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

    // The coach reads the canvas as text and returns no layout — or one it made up.
    it('[DEL-3] an import keeps the author’s layout: every surviving block stays where it was, a new one is laid under the blocks that call it, and no position is the model’s', async () => {
      const { sessionId } = await startSession();
      const authored = validGraph();
      authored.nodes = authored.nodes.map((node, index) => ({
        ...node,
        position: { x: index * 400, y: 80 },
      }));
      await startImprove(sessionId, { ...submission(authored), maxIterations: 3 });

      const revised = coached();
      revised.graph.nodes = revised.graph.nodes.map(({ position: _dropped, ...node }) =>
        // A position the model invented for an author's block is not the author's.
        node.id === 'api' ? { ...node, position: { x: -999, y: -999 } } : node,
      );
      const further: DesignSubmission = {
        ...revised,
        graph: {
          nodes: [...revised.graph.nodes, { id: 'ai-cache', kind: 'cache', label: 'Cache' }],
          edges: [
            ...revised.graph.edges,
            { id: 'ai-e-cache', source: 'api', target: 'ai-cache', kind: 'sync' },
          ],
        },
      };
      h.loop.complete('fake-run-1', [
        { overall: 60, decision: 'revise' },
        { overall: 72, decision: 'revise', artifact: revised },
        { overall: 80, decision: 'accept', artifact: further },
      ]);
      const done = await readImprove(sessionId, 'fake-run-1');
      const graphOf = async (revisionId: string | null) =>
        (await call<GetRevisionResponse>(`${h.url}/revisions/${revisionId}`)).body.data.graph;
      const at = (graph: CanvasGraph, id: string) =>
        graph.nodes.find((node) => node.id === id)?.position;

      const second = await graphOf(done.body.data.iterations[1].revisionId);
      for (const node of authored.nodes) expect(at(second, node.id)).toEqual(node.position);
      // Under the database it replicates: the row below, clear of every other block.
      const replica = at(second, 'ai-replica');
      expect(replica).toEqual({ x: 800, y: 80 + LAYOUT_PITCH.y });
      // What was judged is what is stored — order and all — with only positions added.
      expect(second.nodes.map(({ position: _p, ...node }) => node)).toEqual(
        revised.graph.nodes.map(({ position: _p, ...node }) => node),
      );

      // The next import finds the coach's own block where the last one put it.
      const third = await graphOf(done.body.data.iterations[2].revisionId);
      expect(at(third, 'ai-replica')).toEqual(replica);
      for (const node of authored.nodes) expect(at(third, node.id)).toEqual(node.position);
      // Under the API, beside its first callee's column — where the replica
      // already sits — so the nearest free slot in that row, one column left of it.
      expect(at(third, 'ai-cache')).toEqual({ x: 800 - LAYOUT_PITCH.x, y: 80 + LAYOUT_PITCH.y });
    });

    it('[DEL-3] each iteration lists its confirmed findings grounded on the design it judged, so its reason can name them', async () => {
      const finding = (key: string, locationRefs: string[]): ConfirmedFinding => ({
        key,
        type: 'unhandled_failure',
        severity: 'high',
        confidence: 'high',
        fixability: 'fixable_local',
        locationRefs,
        criterionIds: [],
        hits: 2,
        lenses: ['critic.architecture'],
        rationale: 'a single instance serves every read',
        reconciledTo: null,
      });
      const { sessionId } = await startSession();
      await startImprove(sessionId, { ...submission(), maxIterations: 3 });
      h.loop.complete('fake-run-1', [
        { overall: 40, findings: [finding('unhandled_failure|node.2', ['node.2'])] },
        {
          overall: 60,
          artifact: coached(),
          findings: [finding('unhandled_failure|node.4,node.9', ['node.4', 'node.9'])],
        },
        { overall: 70, artifact: { nope: true }, findings: [finding('gap|node.1', ['node.1'])] },
      ]);
      const [base, revised, unreadable] = (await readImprove(sessionId, 'fake-run-1')).body.data
        .iterations;

      // The base judged the author's drawing: node.2 is its API.
      expect(base.findings).toEqual([
        expect.objectContaining({
          id: 'unhandled_failure|node.2',
          locations: [expect.objectContaining({ ref: 'node.2', part: 'node', key: 'api' })],
          nodeIds: ['api'],
        }),
      ]);
      // The coach's revision is placed on its own drawing; a ref it cannot place stays verbatim.
      expect(revised.findings[0]).toMatchObject({
        nodeIds: ['ai-replica'],
        locationRefs: ['node.4', 'node.9'],
      });
      expect(revised.findings[0].locations.map((location) => location.ref)).toEqual(['node.4']);
      // An artifact that is no submission places nothing, and loses nothing.
      expect(unreadable.findings[0]).toMatchObject({
        locations: [],
        nodeIds: [],
        locationRefs: ['node.1'],
      });
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
  });
});
