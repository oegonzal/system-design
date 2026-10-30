import { MemoryHostRefused, MemoryHostUnreachable } from '@sysdesign/agentic-memory-client';
import { GOLDEN_STRATEGY, memoryClientUnderTest } from '@sysdesign/agentic-memory-client/testing';
import { registerDigestRequestSchema, SCOPE_RULE } from '@sysdesign/contracts';

import { chunkDocument } from '../../core/chunk';
import { SinkFault, type PlannedChunk } from '../../core/ports';
import { covers, entryOf, statusOf } from '../../core/record';
import {
  appliedDto,
  DIGEST_RUN,
  digestDto,
  RECORD_IDS,
  refusedItem,
  REGISTER_DIGEST_RUN,
  runningDigest,
  ScriptedMemoryClient,
  writtenItem,
} from '../../test/fake-memory-client';
import { FIXED_NOW, manifestEntry, MEMORY_URL, NORTH, SPACE_ID } from '../../test/fakes';
import { resolveIngestSpace, type IngestSpace } from './ingest-space';
import { SpaceRefused, SpaceUnknown } from './named-space';
import { RETRACTION_REASON, SpaceIngestSink } from './space-ingest-sink';

const SPACE: IngestSpace = {
  spaceId: SPACE_ID,
  host: MEMORY_URL,
  scope: NORTH,
  registers: ['facts'],
};

const planned = (): PlannedChunk =>
  chunkDocument({
    text: '- Translated the memoir.\n- Wrote Note G.',
    kind: 'notes',
    title: 'notes.md',
    subject: 'Ada',
    date: '2026-10-02',
    partsPerChunk: 8,
    chunkBytes: 6000,
  }).chunks[0] as PlannedChunk;

/** The sink over a client, its wait never sleeping. */
const sinkOver = (client: ScriptedMemoryClient, space: IngestSpace = SPACE) =>
  new SpaceIngestSink(client, space, { pollEveryMs: 0, sleep: async () => undefined });

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

const refusal = (status: number, code: 'digest.applied' | null, message: string) =>
  new MemoryHostRefused({ status, route: 'POST /spaces/:id/digests', code, message });

/** A space posting's entry naming the digest, as the manifest records one. */
const spaceEntry = () =>
  manifestEntry({
    sink: 'space',
    host: MEMORY_URL,
    spaceId: SPACE_ID,
    orchestrationRunId: DIGEST_RUN,
    digestRunId: null,
    status: 'failed',
    steps: { digest: null, store: null },
    error: 'lost mid-wait',
  });

describe('SpaceIngestSink', () => {
  it('[ING-4] hands the chunk in as one digest under the tenant alone, reads it back until the loop settles it, applies once what its step endorsed, and records the records the apply answered', async () => {
    const client = new ScriptedMemoryClient();
    client.script({
      orchestrationRunId: DIGEST_RUN,
      reads: [runningDigest(), runningDigest(), digestDto()],
      apply: appliedDto(),
    });
    const sink = sinkOver(client);
    expect([sink.kind, sink.host, sink.spaceId, sink.scope]).toEqual([
      'space',
      MEMORY_URL,
      SPACE_ID,
      NORTH,
    ]);

    const chunk = planned();
    const outcome = await sink.post(chunk);
    expect(client.started).toHaveLength(1);
    const { spaceId, request } = client.started[0] as (typeof client.started)[number];
    expect(spaceId).toBe(SPACE_ID);
    expect(request).toMatchObject({
      title: 'notes.md',
      registers: ['facts'],
      scope: { tenant: 'north' },
      provenance: { source: 'memory-ingest:notes', sourceRunId: chunk.chunkHash },
    });
    expect(request.parts.map((part) => part.text)).toEqual(chunk.chunk.parts);
    expect(request.parts.every((part) => part.at === null && part.label === null)).toBe(true);
    expect(request.rules).not.toContain(SCOPE_RULE);
    expect(registerDigestRequestSchema.safeParse(request).success).toBe(true);
    expect(client.reads).toEqual([DIGEST_RUN, DIGEST_RUN, DIGEST_RUN]);
    expect(client.applied).toEqual([DIGEST_RUN]);
    expect(outcome).toEqual({
      orchestrationRunId: DIGEST_RUN,
      status: 'complete',
      digestRunId: REGISTER_DIGEST_RUN,
      steps: {
        digest: {
          status: 'complete',
          reason: null,
          note: null,
          counts: { memories: 2, endorsed: 2, withheld: 0 },
        },
        store: {
          status: 'complete',
          reason: null,
          note: null,
          counts: { items: 2, refused: 0, inserted: 2, unchanged: 0, superseded: 0 },
        },
      },
      error: null,
      recordIds: [...RECORD_IDS],
    });
    expect(statusOf(outcome)).toBe('complete');
  });

  it('[ING-4] a digest that endorsed nothing is not applied: the store step says nothing was endorsed, and the digest step’s own reason decides whether the chunk is covered', async () => {
    const client = new ScriptedMemoryClient();
    const empty = digestDto({
      step: {
        status: 'complete',
        reason: 'no-memories',
        note: null,
        counts: { memories: 0, endorsed: 0, withheld: 0 },
      },
      report: { admission: 'admitted', memories: [], endorsed: [], withheld: [] },
    });
    client.script({ orchestrationRunId: DIGEST_RUN, reads: [empty] });
    const outcome = await sinkOver(client).post(planned());
    expect(client.applied).toEqual([]);
    expect(outcome.steps.store).toEqual({
      status: 'skipped',
      reason: 'nothing-endorsed',
      note: null,
      counts: {},
    });
    expect(outcome.recordIds).toEqual([]);
    const entry = entryOf({
      identity: manifestEntry(),
      origin: { sink: 'space', host: MEMORY_URL, spaceId: SPACE_ID, scope: NORTH },
      orchestrationRunId: DIGEST_RUN,
      outcome,
      status: statusOf(outcome),
      error: outcome.error,
      ingestedAt: FIXED_NOW,
      retractedAt: null,
      retractedPoints: null,
    });
    // Holds no facts, says the digest: the chunk is covered. Judged and not accepted, it would not be.
    expect([entry.status, covers(entry)]).toEqual(['unstored', true]);
  });

  it('[ING-4] an endorsed memory the runtime refused is said on the store step, so the chunk is not covered, and the records that were written are kept all the same', async () => {
    const client = new ScriptedMemoryClient();
    client.script({
      orchestrationRunId: DIGEST_RUN,
      reads: [digestDto()],
      apply: appliedDto([writtenItem('m1', RECORD_IDS[0]), refusedItem('m2')]),
    });
    const outcome = await sinkOver(client).post(planned());
    expect(outcome.steps.store).toEqual({
      status: 'complete',
      reason: 'items-refused',
      note: 'm2: candidate.invalid',
      counts: { items: 2, refused: 1, inserted: 1, unchanged: 0, superseded: 0 },
    });
    expect(outcome.recordIds).toEqual([RECORD_IDS[0]]);
  });

  it('a digest the loop failed is a failed posting, its step’s note saying why, and nothing is applied', async () => {
    const client = new ScriptedMemoryClient();
    client.script({
      orchestrationRunId: DIGEST_RUN,
      reads: [
        digestDto({
          status: 'failed',
          step: { status: 'failed', reason: null, note: 'the digest threw', counts: {} },
          digestRunId: null,
          report: null,
        }),
      ],
    });
    const outcome = await sinkOver(client).post(planned());
    expect(outcome).toMatchObject({
      status: 'failed',
      digestRunId: null,
      error: 'the digest threw',
      steps: { digest: { status: 'failed' }, store: null },
      recordIds: [],
    });
    expect(client.applied).toEqual([]);
    expect(statusOf(outcome)).toBe('failed');
  });

  it('[ING-4] speaks the port’s faults: a refused start is a refusal in the host’s words with each offending field, an unreachable host unreachable, and a digest lost or an apply failed after the start an unfinished posting that keeps the run id', async () => {
    const refused = new ScriptedMemoryClient();
    refused.refuseNextStart = new MemoryHostRefused({
      status: 400,
      route: 'POST /spaces/:id/digests',
      code: null,
      message: 'validation failed',
      issues: [{ path: 'parts.0.text', message: 'too long' }],
    });
    const refusal = await faultOf(sinkOver(refused).post(planned()));
    expect([refusal.kind, refusal.message, refusal.orchestrationRunId]).toEqual([
      'refused',
      '400: validation failed (parts.0.text: too long)',
      null,
    ]);
    expect(refused.started).toHaveLength(0);

    const down = new ScriptedMemoryClient();
    down.refuseNextStart = new MemoryHostUnreachable('ECONNREFUSED');
    expect((await faultOf(sinkOver(down).post(planned()))).kind).toBe('unreachable');

    const lost = new ScriptedMemoryClient();
    lost.script({ orchestrationRunId: DIGEST_RUN, reads: [runningDigest(), null] });
    const unfinished = await faultOf(sinkOver(lost).post(planned()));
    expect([unfinished.kind, unfinished.orchestrationRunId]).toEqual(['unfinished', DIGEST_RUN]);
    expect(unfinished.message).toContain(`no longer has digest ${DIGEST_RUN}`);

    const unapplied = new ScriptedMemoryClient();
    unapplied.script({
      orchestrationRunId: DIGEST_RUN,
      reads: [digestDto()],
      apply: new MemoryHostUnreachable('ECONNRESET'),
    });
    const fault = await faultOf(sinkOver(unapplied).post(planned()));
    expect([fault.kind, fault.orchestrationRunId]).toEqual(['unfinished', DIGEST_RUN]);
  });

  it('[ING-4] a digest the host says is applied already — by an earlier attempt whose answer was lost — is read back, and the host’s record of that apply is the answer', async () => {
    const client = new ScriptedMemoryClient();
    client.script({
      orchestrationRunId: DIGEST_RUN,
      reads: [digestDto(), digestDto({ applied: appliedDto() })],
      apply: refusal(409, 'digest.applied', 'remembered already'),
    });
    const outcome = await sinkOver(client).post(planned());
    expect(outcome.recordIds).toEqual([...RECORD_IDS]);
    expect(outcome.steps.store?.status).toBe('complete');
    expect(client.reads).toEqual([DIGEST_RUN, DIGEST_RUN]);
  });

  it('[ING-4] reads a posting back from the host: applied, with the records it left; settled and never applied, with the store step saying so, so the chunk is posted again; gone, as null', async () => {
    const applied = new ScriptedMemoryClient();
    applied.script({
      orchestrationRunId: DIGEST_RUN,
      reads: [digestDto({ applied: appliedDto() })],
    });
    expect(await sinkOver(applied).status(spaceEntry())).toMatchObject({
      status: 'complete',
      digestRunId: REGISTER_DIGEST_RUN,
      recordIds: [...RECORD_IDS],
      steps: { store: { status: 'complete', reason: null } },
    });

    const unapplied = new ScriptedMemoryClient();
    unapplied.script({ orchestrationRunId: DIGEST_RUN, reads: [digestDto()] });
    const outcome = await sinkOver(unapplied).status(spaceEntry());
    expect(outcome?.steps.store).toEqual({
      status: 'skipped',
      reason: 'not-applied',
      note: null,
      counts: {},
    });
    expect(outcome === null ? null : statusOf(outcome)).toBe('unstored');

    const gone = new ScriptedMemoryClient();
    expect(await sinkOver(gone).status(spaceEntry())).toBeNull();
    expect(await sinkOver(gone).status(manifestEntry({ orchestrationRunId: null }))).toBeNull();
    expect(gone.reads).toEqual([DIGEST_RUN]);
  });
});

/** The space the retraction and the resolution are proved against: the engine, through the in-process client. */
async function spaceUnderTest() {
  const harness = memoryClientUnderTest({ strategies: { 'run-golden': GOLDEN_STRATEGY } });
  const { space } = await harness.client.ensureSpace('ingest-space', { runId: 'run-golden' });
  const remember = (predicate: string, value: string) =>
    harness.client.remember(space.id, {
      register: 'semantic_fact',
      scope: { tenant: 'north' },
      candidate: { subject: 'Ada', predicate, value, validFrom: null },
      provenance: { source: 'memory-ingest:notes', sourceRunId: null },
    });
  return { ...harness, space, remember };
}

describe('SpaceIngestSink, retracting', () => {
  it('[ING-4] closes each recorded record with the retraction’s reason under the scope the posting wrote under, keeps one another standing posting lists too, collects every refusal rather than stopping at the first, and asks again for what is left — a record closed already counting for nothing', async () => {
    const { client, space, remember } = await spaceUnderTest();
    const language = (await remember('language', 'TypeScript')).record;
    const years = (await remember('years', 'twelve')).record;
    const shared = (await remember('city', 'London')).record;
    const sink = new SpaceIngestSink(
      client,
      {
        spaceId: space.id,
        host: MEMORY_URL,
        scope: NORTH,
        registers: ['semantic_fact'],
      },
      { pollEveryMs: 0 },
    );
    const bogus = '00000000-0000-4000-8000-000000000000';
    const entry = manifestEntry({
      sink: 'space',
      host: MEMORY_URL,
      spaceId: space.id,
      scope: NORTH,
      recordIds: [bogus, language.id, years.id, shared.id],
    });

    // The shared record is another standing posting's too: kept current, asked nothing of the host.
    const fault = await faultOf(sink.retract(entry, new Set([shared.id])));
    expect(fault.kind).toBe('refused');
    expect(fault.message).toContain('1 of 4 records were not closed');
    expect(fault.message).toContain(bogus);
    // The two the scope sees were closed all the same, with the reason, and nothing recalls them; the shared one stands.
    const closed = await client.history(space.id, { recordId: language.id, scope: NORTH });
    expect(closed.map(({ status, closeReason }) => [status, closeReason])).toEqual([
      ['invalidated', RETRACTION_REASON],
    ]);
    const recalled = await client.recall(space.id, { scope: NORTH, key: 'Ada' });
    expect(recalled.items.map(({ record }) => record.id)).toEqual([shared.id]);

    // Asked again for the ones it has: closed already, they count for nothing, and nothing is refused.
    expect(await sink.retract({ ...entry, recordIds: [language.id, years.id] }, new Set())).toBe(0);
    const fresh = (await remember('street', 'Marylebone')).record;
    expect(await sink.retract({ ...entry, recordIds: [fresh.id, years.id] }, new Set())).toBe(1);
  });
});

describe('resolveIngestSpace', () => {
  it('[ING-4] finds the space by name and checks it once: it compiles, and every register the digests may file into exists and takes a remember — every unmet need listed, a name nobody holds refused by name', async () => {
    const { client, space } = await spaceUnderTest();
    const settings = { space: 'ingest-space', tenant: 'north', registers: ['semantic_fact'] };
    expect(await resolveIngestSpace(client, settings, MEMORY_URL)).toEqual({
      spaceId: space.id,
      host: MEMORY_URL,
      scope: { tenant: 'north' },
      registers: ['semantic_fact'],
    });

    const unknown = resolveIngestSpace(client, { ...settings, space: 'nobody' }, MEMORY_URL);
    await expect(unknown).rejects.toBeInstanceOf(SpaceUnknown);
    await expect(unknown).rejects.toThrow(`no memory space is named nobody at ${MEMORY_URL}`);

    const unserved = resolveIngestSpace(
      client,
      { ...settings, registers: ['semantic_fact', 'procedural_playbook', 'nope'] },
      MEMORY_URL,
    );
    await expect(unserved).rejects.toBeInstanceOf(SpaceRefused);
    await expect(unserved).rejects.toThrow(
      'register procedural_playbook: declares no remember, so a digest may not file into it; register nope: the space has none by that name',
    );
  });
});
