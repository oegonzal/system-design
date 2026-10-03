import { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ManifestEntry } from '../../core/ports';
import { FIXED_NOW } from '../../test/fakes';
import { JsonFileLedger, MANIFEST_FILE, ManifestUnreadable } from './json-file-ledger';

const entry = (overrides: Partial<ManifestEntry> = {}): ManifestEntry => ({
  chunkHash: 'a'.repeat(64),
  document: 'notes.md',
  chunk: { index: 1, of: 2 },
  kind: 'notes',
  orchestrationRunId: 'orch-1',
  digestRunId: 'run-1',
  status: 'unstored',
  steps: {
    digest: { status: 'complete', reason: null, note: null, counts: { memories: 3 } },
    store: { status: 'skipped', reason: 'store-unavailable', note: 'qdrant down', counts: {} },
  },
  error: null,
  ingestedAt: FIXED_NOW,
  loopUrl: 'http://loop.test',
  ...overrides,
});

describe('JsonFileLedger', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'memory-ingest-ledger-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('[ING-1] is empty when there is no manifest, round-trips what it saves, and leaves no temp file behind', async () => {
    const ledger = new JsonFileLedger(join(dir, 'home'));
    expect(await ledger.load()).toEqual([]);

    const entries = [entry(), entry({ chunkHash: 'b'.repeat(64), chunk: { index: 2, of: 2 } })];
    await ledger.save(entries);
    expect(await ledger.load()).toEqual(entries);
    expect(await readdir(join(dir, 'home'))).toEqual([MANIFEST_FILE]);
    await expect(access(`${ledger.path}.tmp`)).rejects.toThrow();

    await ledger.save([entries[1] as ManifestEntry]);
    expect(await ledger.load()).toEqual([entries[1]]);
    expect(await readFile(ledger.path, 'utf8')).toMatch(/^\{\n {2}"version": 1,/);
  });

  it('refuses a manifest it cannot read, naming the file and the problem', async () => {
    const ledger = new JsonFileLedger(dir);
    await writeFile(ledger.path, '{ not json', 'utf8');
    await expect(ledger.load()).rejects.toBeInstanceOf(ManifestUnreadable);
    await expect(ledger.load()).rejects.toThrow(ledger.path);

    await writeFile(ledger.path, JSON.stringify({ version: 2, entries: [] }), 'utf8');
    await expect(ledger.load()).rejects.toThrow(/version/);

    await writeFile(
      ledger.path,
      JSON.stringify({ version: 1, entries: [{ ...entry(), status: 'done' }] }),
      'utf8',
    );
    await expect(ledger.load()).rejects.toThrow(/entries\.0\.status/);
  });
});
