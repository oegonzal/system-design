import { LoopUnreachable } from '@sysdesign/loop-client';

import { fakeIngestLoop } from '../test/fake-ingest-loop';
import { FIXED_NOW, fixedClock, InMemoryLedger, manifestEntry } from '../test/fakes';
import type { ManifestEntry } from './ports';
import { NotInManifest, retractDocuments, type RetractDeps } from './retract';

const EARLIER = '2026-10-01T09:00:00.000Z';
/** The loop the command is configured for — the one `manifestEntry` records postings under. */
const LOOP_URL = manifestEntry().loopUrl;

/** The fake loop behind the shipping sink, its store holding the points a spec gives each digest run. */
function harness(entries: Partial<ManifestEntry>[], points: Record<string, number>) {
  const fake = fakeIngestLoop();
  for (const [digestRunId, held] of Object.entries(points))
    fake.client.points.set(digestRunId, held);
  const ledger = new InMemoryLedger(entries.map((overrides) => manifestEntry(overrides)));
  const deps: RetractDeps = { sink: fake.sink, ledger, clock: fixedClock(), loopUrl: LOOP_URL };
  return { ...fake, ledger, deps };
}

/** A digest run retracted through the configured loop, with the points it removed. */
const retracted = (digestRunId: string, removed: number) => ({
  digestRunId,
  removed,
  recordedUnder: null,
});

const options = (overrides: { dryRun?: boolean; cwd?: string } = {}) => ({
  dryRun: false,
  cwd: '/work',
  ...overrides,
});

describe('retractDocuments', () => {
  it('[ING-3] retires a document: every digest run any of its entries names, whatever its status, is retracted and every entry naming it marked — saved after each, the runs that held nothing counted apart', async () => {
    const { deps, ledger, loop } = harness(
      [
        { chunkHash: 'h1', digestRunId: 'run-1' },
        // Unstored still names the digest run that judged it: retracting that removes nothing.
        { chunkHash: 'h2', digestRunId: 'run-2', status: 'unstored' },
        // Failed after its digest ran: whatever that run stored goes all the same.
        { chunkHash: 'h3', digestRunId: 'run-3', status: 'failed', error: 'the store step threw' },
        // Refused: no orchestration, no digest run, nothing to retract.
        { chunkHash: 'h4', digestRunId: null, orchestrationRunId: null, status: 'refused' },
        { chunkHash: 'o1', document: 'other.md', digestRunId: 'other-run' },
      ],
      { 'run-1': 4, 'run-3': 2, 'other-run': 5 },
    );
    // What the ledger held saved when each retraction was asked: the marks before it, never after.
    const marksAtEach: number[] = [];
    const sink = deps.sink;
    const report = await retractDocuments(['notes.md'], options(), {
      ...deps,
      sink: {
        retract: (digestRunId) => {
          marksAtEach.push(ledger.entries.filter((entry) => entry.retractedAt !== null).length);
          return sink.retract(digestRunId);
        },
      },
    });

    expect(report).toEqual({
      dryRun: false,
      documents: [
        {
          document: 'notes.md',
          entries: 4,
          already: [],
          runs: ['run-1', 'run-2', 'run-3'],
          retraction: {
            through: LOOP_URL,
            retracted: [retracted('run-1', 4), retracted('run-2', 0), retracted('run-3', 2)],
            left: null,
          },
          unresolved: 0,
        },
      ],
    });
    expect(marksAtEach).toEqual([0, 1, 2]);
    expect(ledger.saves).toBe(3);
    expect(loop.retracted).toEqual(['run-1', 'run-2', 'run-3']);
    expect(
      ledger.entries.map((entry) => [entry.chunkHash, entry.retractedAt, entry.retractedPoints]),
    ).toEqual([
      ['h1', FIXED_NOW, 4],
      ['h2', FIXED_NOW, 0],
      ['h3', FIXED_NOW, 2],
      ['h4', null, null],
      // Another document's entries are not this document's to retract.
      ['o1', null, null],
    ]);
  });

  it('[ING-3] finds a document by the key the ingest recorded it under, from its path alone, and refuses a path the manifest has no entry for — naming the manifest — before retracting anything', async () => {
    const { deps, ledger, loop } = harness([{ document: 'docs/notes.md', digestRunId: 'run-1' }], {
      'run-1': 3,
    });
    // No reader is in the deps at all: the document is never read, so a deleted one retires the same.
    const report = await retractDocuments(
      ['./docs/../docs/notes.md', '/work/docs/notes.md'],
      options(),
      deps,
    );
    expect(report.documents.map((document) => document.document)).toEqual(['docs/notes.md']);
    expect(loop.retracted).toEqual(['run-1']);

    const refused = retractDocuments(['docs/notes.md', 'notes.md', 'gone.pdf'], options(), deps);
    await expect(refused).rejects.toBeInstanceOf(NotInManifest);
    await expect(refused).rejects.toThrow(`${ledger.path} has no entry for notes.md, gone.pdf`);
    // The same file named from another directory is another key, and the manifest has no entry for it.
    await expect(
      retractDocuments(['notes.md'], options({ cwd: '/work/docs' }), deps),
    ).rejects.toThrow(`${ledger.path} has no entry for notes.md:`);
    expect(loop.retracted).toEqual(['run-1']);
    expect(ledger.saves).toBe(1);
  });

  it('[ING-3] a retraction the loop does not carry out stops the batch: what went is marked and saved, the rest of that document and every one after is left standing with why, and retracting again finishes the job', async () => {
    const { deps, ledger, client } = harness(
      [
        { chunkHash: 'a1', document: 'a.md', digestRunId: 'a-run-1' },
        { chunkHash: 'a2', document: 'a.md', digestRunId: 'a-run-2' },
        { chunkHash: 'b1', document: 'b.md', digestRunId: 'b-run-1' },
      ],
      { 'a-run-1': 3, 'a-run-2': 3, 'b-run-1': 3 },
    );
    client.failingRetractions.set('a-run-2', new LoopUnreachable('ECONNREFUSED'));

    const report = await retractDocuments(['a.md', 'b.md'], options(), deps);
    const error = 'the quality loop is unreachable: ECONNREFUSED';
    expect(report.documents.map((document) => document.retraction)).toEqual([
      {
        through: LOOP_URL,
        retracted: [retracted('a-run-1', 3)],
        left: { digestRunIds: ['a-run-2'], error },
      },
      { through: LOOP_URL, retracted: [], left: { digestRunIds: ['b-run-1'], error } },
    ]);
    // The first mark is on the saved ledger though the second retraction failed.
    expect(ledger.entries.map((entry) => entry.retractedAt)).toEqual([FIXED_NOW, null, null]);

    client.failingRetractions.clear();
    const again = await retractDocuments(['a.md', 'b.md'], options(), deps);
    expect(again.documents.map((document) => [document.already, document.runs])).toEqual([
      [['a-run-1'], ['a-run-2']],
      [[], ['b-run-1']],
    ]);
    expect(ledger.entries.every((entry) => entry.retractedAt !== null)).toBe(true);
  });

  it('asks no second time for a run already marked, keeps the first mark, and a dry run lists the runs and changes nothing', async () => {
    const { deps, ledger, loop } = harness(
      [
        { chunkHash: 'h1', digestRunId: 'run-1', retractedAt: EARLIER, retractedPoints: 6 },
        { chunkHash: 'h2', digestRunId: 'run-2' },
      ],
      { 'run-2': 2 },
    );
    const dry = await retractDocuments(['notes.md'], options({ dryRun: true }), deps);
    expect(dry).toEqual({
      dryRun: true,
      documents: [
        {
          document: 'notes.md',
          entries: 2,
          already: ['run-1'],
          runs: ['run-2'],
          retraction: null,
          unresolved: 0,
        },
      ],
    });
    expect(loop.retracted).toEqual([]);
    expect(ledger.saves).toBe(0);

    await retractDocuments(['notes.md'], options(), deps);
    expect(loop.retracted).toEqual(['run-2']);
    expect(ledger.entries.map((entry) => [entry.retractedAt, entry.retractedPoints])).toEqual([
      [EARLIER, 6],
      [FIXED_NOW, 2],
    ]);

    // Everything retracted already: nothing is asked, and nothing is left standing.
    const after = await retractDocuments(['notes.md'], options(), deps);
    expect(after.documents[0]).toMatchObject({
      already: ['run-1', 'run-2'],
      runs: [],
      retraction: { through: LOOP_URL, retracted: [], left: null },
    });
    expect(loop.retracted).toEqual(['run-2']);
  });

  it('[ING-3] retracts a run recorded under another loop through the configured one and marks it — one store may serve both — but reports it apart, under the loop it was recorded under', async () => {
    const OTHER = 'http://other-loop.test';
    const { deps, ledger, loop } = harness(
      [
        { chunkHash: 'h1', digestRunId: 'run-1' },
        { chunkHash: 'h2', digestRunId: 'run-2', loopUrl: OTHER },
      ],
      { 'run-1': 3, 'run-2': 4 },
    );
    const report = await retractDocuments(['notes.md'], options(), deps);
    expect(report.documents[0]?.retraction).toEqual({
      through: LOOP_URL,
      retracted: [
        retracted('run-1', 3),
        { digestRunId: 'run-2', removed: 4, recordedUnder: OTHER },
      ],
      left: null,
    });
    expect(loop.retracted).toEqual(['run-1', 'run-2']);
    expect(ledger.entries.map((entry) => [entry.retractedAt, entry.retractedPoints])).toEqual([
      [FIXED_NOW, 3],
      [FIXED_NOW, 4],
    ]);
  });

  it('counts the entries naming an orchestration whose report was never read, since no digest run is known to retract for them', async () => {
    const { deps } = harness(
      [
        { chunkHash: 'h1', digestRunId: 'run-1' },
        // A wait lost after the start: the orchestration is known, its digest run is not.
        {
          chunkHash: 'h2',
          digestRunId: null,
          status: 'failed',
          steps: { digest: null, store: null },
          error: 'the quality loop no longer has run x',
        },
        // A settled orchestration whose digest stored nothing: known to hold nothing.
        {
          chunkHash: 'h3',
          digestRunId: null,
          status: 'unstored',
          steps: {
            digest: { status: 'skipped', reason: 'embeddings-disabled', note: null, counts: {} },
            store: { status: 'skipped', reason: 'upstream-skipped', note: 'digest', counts: {} },
          },
        },
      ],
      {},
    );
    const report = await retractDocuments(['notes.md'], options({ dryRun: true }), deps);
    expect(report.documents[0]).toMatchObject({ runs: ['run-1'], unresolved: 1 });
  });
});
