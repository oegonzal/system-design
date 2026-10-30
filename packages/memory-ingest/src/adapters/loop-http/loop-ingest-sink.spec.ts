import { DOCUMENT_MEMORY_ORCHESTRATOR_ID } from '@sysdesign/contracts';
import { LoopRefused, LoopUnreachable } from '@sysdesign/loop-client';

import { chunkDocument, PARTS_PER_CHUNK } from '../../core/chunk';
import { SinkFault, type PlannedChunk } from '../../core/ports';
import { fakeIngestLoop } from '../../test/fake-ingest-loop';
import { LOOP_URL, manifestEntry, settledOrchestration, stepOf } from '../../test/fakes';
import { INGEST_MAX_ITERATIONS, outcomeOf } from './loop-ingest-sink';

const planned = (): PlannedChunk =>
  chunkDocument({
    text: '# Ada\n\n- Translated the memoir.',
    kind: 'notes',
    title: 'notes.md',
    subject: 'Ada',
    date: null,
    partsPerChunk: PARTS_PER_CHUNK,
    chunkBytes: 6000,
  }).chunks[0] as PlannedChunk;

/** The fault a call raised, so a spec asserts it by its declared kind. */
const faultOf = async (call: Promise<unknown>): Promise<SinkFault> => {
  try {
    await call;
  } catch (error) {
    if (error instanceof SinkFault) return error;
    throw error;
  }
  throw new Error('expected a sink fault');
};

describe('LoopIngestSink', () => {
  it('[ING-1] starts the document-memory orchestration on the rendered goal and answers once it has settled, as a posting through the loop', async () => {
    const { sink, posted } = fakeIngestLoop();
    expect([sink.kind, sink.host, sink.spaceId]).toEqual(['loop', LOOP_URL, null]);
    const chunk = planned();
    const settled = await sink.post(chunk);
    expect(posted).toEqual([
      {
        orchestrator: DOCUMENT_MEMORY_ORCHESTRATOR_ID,
        request: { goal: chunk.goal, maxIterations: INGEST_MAX_ITERATIONS },
      },
    ]);
    expect(settled).toMatchObject({
      status: 'complete',
      digestRunId: 'digest-run-1',
      recordIds: [],
      error: null,
      steps: { digest: { status: 'complete' }, store: { status: 'complete' } },
    });
    const entry = manifestEntry({ orchestrationRunId: settled.orchestrationRunId });
    expect(await sink.status(entry)).toEqual(settled);
    expect(await sink.status(manifestEntry({ orchestrationRunId: 'nope' }))).toBeNull();
    expect(await sink.status(manifestEntry({ orchestrationRunId: null }))).toBeNull();
  });

  it('reads an orchestration as a posting’s outcome: the loop’s two steps summarized, the digest run named, no records', () => {
    expect(outcomeOf(settledOrchestration())).toEqual({
      orchestrationRunId: 'orch-1',
      status: 'complete',
      digestRunId: 'digest-run-1',
      steps: {
        digest: { status: 'complete', reason: null, note: null, counts: { memories: 3, kept: 3 } },
        store: {
          status: 'complete',
          reason: null,
          note: null,
          counts: { chunks: 3, embedded: 3 },
        },
      },
      error: null,
      recordIds: [],
    });
    expect(
      outcomeOf(
        settledOrchestration({
          status: 'failed',
          steps: { digest: stepOf({ status: 'failed', note: 'threw' }) },
          error: { name: 'Error', message: 'the digest threw', stack: null },
        }),
      ),
    ).toMatchObject({
      status: 'failed',
      digestRunId: null,
      steps: { digest: { status: 'failed', note: 'threw' }, store: null },
      error: 'the digest threw',
    });
  });

  it('[ING-1] speaks the port’s faults: a wait that fails after the start is an unfinished posting that keeps the orchestration id, a refused start a refusal in the loop’s own words, an unreachable loop unreachable', async () => {
    const lost = fakeIngestLoop([{ lose: true }]);
    const unfinished = await faultOf(lost.sink.post(planned()));
    expect(unfinished.kind).toBe('unfinished');
    expect(unfinished.orchestrationRunId).toBe('fake-run-orchestration-1');
    expect(unfinished.message).toContain('no longer has');
    expect(lost.posted).toHaveLength(1);

    const refused = fakeIngestLoop();
    refused.client.refuseNextStart = new LoopRefused(400, 'no document index');
    const refusal = await faultOf(refused.sink.post(planned()));
    expect([refusal.kind, refusal.message, refusal.orchestrationRunId]).toEqual([
      'refused',
      '400: no document index',
      null,
    ]);
    expect(refused.posted).toHaveLength(0);

    const down = fakeIngestLoop();
    down.loop.unreachable = true;
    expect((await faultOf(down.sink.post(planned()))).kind).toBe('unreachable');
    expect((await faultOf(down.sink.status(manifestEntry()))).kind).toBe('unreachable');
  });

  it('[ING-3] retracts what a posting stored by its digest run, the id every point of it carries; a posting that names no run removes nothing', async () => {
    const { sink, client, loop } = fakeIngestLoop();
    client.points.set('digest-run-1', 4);
    expect(await sink.retract(manifestEntry({ digestRunId: 'digest-run-1' }))).toBe(4);
    expect(await sink.retract(manifestEntry({ digestRunId: 'digest-run-1' }))).toBe(0);
    expect(loop.retracted).toEqual(['digest-run-1', 'digest-run-1']);
    expect(await sink.retract(manifestEntry({ digestRunId: null }))).toBe(0);
    expect(loop.retracted).toHaveLength(2);

    client.failingRetractions.set('digest-run-2', new LoopUnreachable('ECONNREFUSED'));
    const fault = await faultOf(sink.retract(manifestEntry({ digestRunId: 'digest-run-2' })));
    expect([fault.kind, fault.message]).toEqual([
      'unreachable',
      'the quality loop is unreachable: ECONNREFUSED',
    ]);
  });
});
