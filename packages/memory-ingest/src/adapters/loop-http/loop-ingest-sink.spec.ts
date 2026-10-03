import { DOCUMENT_MEMORY_ORCHESTRATOR_ID } from '@sysdesign/contracts';
import { LoopRefused, LoopRunLost } from '@sysdesign/loop-client';

import { chunkDocument, PARTS_PER_CHUNK } from '../../core/chunk';
import { IngestWaitFailed, type PlannedChunk } from '../../core/ports';
import { fakeIngestLoop } from '../../test/fake-ingest-loop';
import { INGEST_MAX_ITERATIONS } from './loop-ingest-sink';

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

describe('LoopIngestSink', () => {
  it('[ING-1] starts the document-memory orchestration on the rendered goal and answers once it has settled', async () => {
    const { sink, posted } = fakeIngestLoop();
    const chunk = planned();
    const settled = await sink.post(chunk);
    expect(posted).toEqual([
      {
        orchestrator: DOCUMENT_MEMORY_ORCHESTRATOR_ID,
        request: { goal: chunk.goal, maxIterations: INGEST_MAX_ITERATIONS },
      },
    ]);
    expect(settled.status).toBe('complete');
    expect(settled.steps['digest']?.runIds).toEqual(['digest-run-1']);
    expect(await sink.status(settled.orchestrationRunId)).toEqual(settled);
    expect(await sink.status('nope')).toBeNull();
  });

  it('wraps a wait that fails after the start so the caller keeps the orchestration id; a refused start is the loop’s own error', async () => {
    const lost = fakeIngestLoop([{ lose: true }]);
    const failure = await lost.sink.post(planned()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(IngestWaitFailed);
    expect(lost.posted).toHaveLength(1);
    expect((failure as IngestWaitFailed).orchestrationRunId).toBe('fake-run-orchestration-1');
    expect((failure as IngestWaitFailed).cause).toBeInstanceOf(LoopRunLost);

    const refused = fakeIngestLoop();
    refused.client.refuseNextStart = new LoopRefused(400, 'no document index');
    await expect(refused.sink.post(planned())).rejects.toBeInstanceOf(LoopRefused);
    expect(refused.posted).toHaveLength(0);
  });
});
