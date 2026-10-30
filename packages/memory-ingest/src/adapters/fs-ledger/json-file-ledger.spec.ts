import { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ManifestEntry } from '../../core/ports';
import { manifestEntry, MEMORY_URL, NORTH, SPACE_ID } from '../../test/fakes';
import {
  JsonFileLedger,
  LOCK_FILE,
  MANIFEST_FILE,
  ManifestLocked,
  ManifestUnreadable,
} from './json-file-ledger';

const unstored = (overrides: Partial<ManifestEntry> = {}): ManifestEntry =>
  manifestEntry({
    chunk: { index: 1, of: 2 },
    status: 'unstored',
    steps: {
      digest: { status: 'complete', reason: null, note: null, counts: { memories: 3 } },
      store: { status: 'skipped', reason: 'store-unavailable', note: 'qdrant down', counts: {} },
    },
    ...overrides,
  });

/** A loop posting as versions 1 and 2 wrote one: the loop's URL under `loopUrl`, nothing of where else a posting could go. */
const loopPosting = (entry: ManifestEntry) => {
  const {
    sink: _sink,
    host,
    spaceId: _spaceId,
    scope: _scope,
    recordIds: _recordIds,
    ...posting
  } = entry;
  return { ...posting, loopUrl: host };
};

/** A posting as version 3 wrote one: where it went, but not the scope it wrote under. */
const unscopedPosting = (entry: ManifestEntry) => {
  const { scope: _scope, ...posting } = entry;
  return posting;
};

describe('JsonFileLedger', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'memory-ingest-ledger-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('[ING-1] [ING-4] is empty when there is no manifest, round-trips what it saves — retraction marks, the sink, the space, the scope and the records included — and leaves no temp file behind', async () => {
    const ledger = new JsonFileLedger(join(dir, 'home'));
    expect(await ledger.load()).toEqual([]);

    const entries = [
      unstored(),
      manifestEntry({
        chunkHash: 'b'.repeat(64),
        chunk: { index: 2, of: 2 },
        retractedAt: '2026-10-14T08:00:00.000Z',
        retractedPoints: 0,
      }),
      manifestEntry({
        chunkHash: 'c'.repeat(64),
        sink: 'space',
        host: MEMORY_URL,
        spaceId: SPACE_ID,
        scope: { ...NORTH, project: 'job-assistant' },
        orchestrationRunId: 'digest-1',
        digestRunId: 'register-digest-1',
        recordIds: ['r-1', 'r-2'],
      }),
    ];
    await ledger.save(entries);
    expect(await ledger.load()).toEqual(entries);
    expect(await readdir(join(dir, 'home'))).toEqual([MANIFEST_FILE]);
    await expect(access(`${ledger.path}.tmp`)).rejects.toThrow();

    await ledger.save([entries[1] as ManifestEntry]);
    expect(await ledger.load()).toEqual([entries[1]]);
    expect(await readFile(ledger.path, 'utf8')).toMatch(/^\{\n {2}"version": 4,/);
  });

  it('[ING-4] reads a version 3 manifest, written before a space posting recorded its scope: a loop posting under none, a space posting under none too — no store’s to act on — and saves it as version 4', async () => {
    const ledger = new JsonFileLedger(dir);
    const space = manifestEntry({
      chunkHash: 'c'.repeat(64),
      sink: 'space',
      host: MEMORY_URL,
      spaceId: SPACE_ID,
      scope: NORTH,
      recordIds: ['r-1'],
    });
    await writeFile(
      ledger.path,
      JSON.stringify({
        version: 3,
        entries: [unscopedPosting(unstored()), unscopedPosting(space)],
      }),
      'utf8',
    );
    expect(await ledger.load()).toEqual([unstored(), { ...space, scope: null }]);
    await ledger.save(await ledger.load());
    expect(JSON.parse(await readFile(ledger.path, 'utf8'))).toMatchObject({ version: 4 });
  });

  it('[ING-4] reads a version 1 or 2 manifest, written when every posting went to the loop, as loop postings under the URL each recorded — version 1 with every posting standing — and saves it as version 4', async () => {
    const ledger = new JsonFileLedger(dir);
    const { retractedAt, retractedPoints, ...posting } = loopPosting(unstored());
    expect([retractedAt, retractedPoints]).toEqual([null, null]);
    await writeFile(ledger.path, JSON.stringify({ version: 1, entries: [posting] }), 'utf8');
    expect(await ledger.load()).toEqual([unstored()]);

    const marked = unstored({ retractedAt: '2026-10-14T08:00:00.000Z', retractedPoints: 2 });
    await writeFile(
      ledger.path,
      JSON.stringify({ version: 2, entries: [loopPosting(marked)] }),
      'utf8',
    );
    expect(await ledger.load()).toEqual([marked]);
    await ledger.save(await ledger.load());
    expect(JSON.parse(await readFile(ledger.path, 'utf8'))).toEqual({
      version: 4,
      entries: [marked],
    });
  });

  it('refuses a manifest it cannot read, naming the file and the problem', async () => {
    const ledger = new JsonFileLedger(dir);
    await writeFile(ledger.path, '{ not json', 'utf8');
    await expect(ledger.load()).rejects.toBeInstanceOf(ManifestUnreadable);
    await expect(ledger.load()).rejects.toThrow(ledger.path);

    // A version this build does not know — a newer build's — is refused, never read as one it knows.
    await writeFile(ledger.path, JSON.stringify({ version: 5, entries: [] }), 'utf8');
    await expect(ledger.load()).rejects.toThrow(/version/);

    await writeFile(
      ledger.path,
      JSON.stringify({ version: 4, entries: [{ ...unstored(), status: 'done' }] }),
      'utf8',
    );
    await expect(ledger.load()).rejects.toThrow(/entries\.0\.status/);

    // Version 4 records where a posting went and the scope it wrote under: an entry without either is not one it wrote.
    const { sink: _sink, ...unplaced } = unstored();
    await writeFile(ledger.path, JSON.stringify({ version: 4, entries: [unplaced] }), 'utf8');
    await expect(ledger.load()).rejects.toThrow(/entries\.0\.sink/);
    await writeFile(
      ledger.path,
      JSON.stringify({ version: 4, entries: [unscopedPosting(unstored())] }),
      'utf8',
    );
    await expect(ledger.load()).rejects.toThrow(/entries\.0\.scope/);

    // Version 2 records the marks: an entry without them is not one it wrote.
    const { retractedAt: _at, ...unmarked } = loopPosting(unstored());
    await writeFile(ledger.path, JSON.stringify({ version: 2, entries: [unmarked] }), 'utf8');
    await expect(ledger.load()).rejects.toThrow(/entries\.0\.retractedAt/);
  });

  it('is held by one command at a time: a second lock is refused, naming the lock file, until the first is released', async () => {
    const ledger = new JsonFileLedger(join(dir, 'home'));
    const release = await ledger.lock();
    const lockPath = join(dir, 'home', LOCK_FILE);
    await expect(access(lockPath)).resolves.toBeUndefined();

    // Another command over the same home — another process, as far as the file can tell.
    const other = new JsonFileLedger(join(dir, 'home'));
    await expect(other.lock()).rejects.toBeInstanceOf(ManifestLocked);
    await expect(other.lock()).rejects.toThrow(lockPath);

    await release();
    await expect(access(lockPath)).rejects.toThrow();
    const again = await other.lock();
    await again();
    expect(await readdir(join(dir, 'home'))).toEqual([]);
  });
});
