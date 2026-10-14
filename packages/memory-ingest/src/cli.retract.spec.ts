import { LoopRefused } from '@sysdesign/loop-client';

import { execute } from './cli';
import { cliDeps as deps, io, parsed } from './test/cli-harness';
import { FIXED_NOW, InMemoryLedger, manifestEntry } from './test/fakes';

/** `retract` over the ports, and the one writer every command that saves the manifest runs as. */
describe('execute, as a writer of the manifest', () => {
  it('[ING-3] retract retires each document, prints the points each digest run removed with the runs that held nothing apart, and exits 0 — also when everything was retracted already', async () => {
    const ledger = new InMemoryLedger([
      manifestEntry({ chunkHash: 'h1', digestRunId: 'run-1' }),
      manifestEntry({ chunkHash: 'h2', digestRunId: 'run-2', status: 'unstored' }),
    ]);
    const d = deps({ ledger });
    d.scripted.points.set('run-1', 3);
    const { out, sink } = io();
    expect(await execute(parsed(['retract', 'notes.md']), d, sink)).toBe(0);
    expect(out[0]).toContain('notes.md · 2 entries');
    expect(out[0]).toMatch(/run-1\s+3/);
    expect(out[0]).toContain('held nothing (1): run-2');
    expect(out[0]).toContain('retracted 2 digest runs (3 points)');
    expect(d.scripted.retracted).toEqual(['run-1', 'run-2']);
    expect(ledger.entries.map((entry) => [entry.retractedAt, entry.retractedPoints])).toEqual([
      [FIXED_NOW, 3],
      [FIXED_NOW, 0],
    ]);

    const again = io();
    expect(await execute(parsed(['retract', 'notes.md', '--json']), d, again.sink)).toBe(0);
    expect(JSON.parse(again.out[0] ?? '')).toMatchObject({
      dryRun: false,
      documents: [{ document: 'notes.md', already: ['run-1', 'run-2'], runs: [] }],
    });
    expect(d.scripted.retracted).toEqual(['run-1', 'run-2']);
  });

  it('[ING-3] retract exits 2 naming the manifest when it has no entry for a path, retracting nothing, and 1 when a retraction left a digest run standing', async () => {
    const ledger = new InMemoryLedger([manifestEntry({ digestRunId: 'run-1' })]);
    const missing = deps({ ledger });
    const { errors, sink } = io();
    expect(await execute(parsed(['retract', 'notes.md', 'resume.pdf']), missing, sink)).toBe(2);
    expect(errors[0]).toContain(`${ledger.path} has no entry for resume.pdf`);
    expect(missing.scripted.retracted).toEqual([]);

    const failing = deps({ ledger });
    failing.scripted.failingRetractions.set(
      'run-1',
      new LoopRefused(503, 'the store is unavailable'),
    );
    const second = io();
    expect(await execute(parsed(['retract', 'notes.md']), failing, second.sink)).toBe(1);
    expect(second.out[0]).toContain('left standing (1): run-1 — 503: the store is unavailable');
    expect(ledger.entries[0]?.retractedAt).toBeNull();
  });

  it('[ING-3] a command that saves the manifest runs as its one writer: ingest, retract and status --refresh refuse a home another command holds with exit 2, and release it when done, thrown or not; a dry run and a plain status save nothing and take no lock', async () => {
    const ledger = new InMemoryLedger([manifestEntry({ digestRunId: 'run-1' })]);
    const d = deps({ ledger });
    ledger.held = true;
    for (const argv of [
      ['ingest', 'notes.md', '--subject', 'Ada'],
      ['retract', 'notes.md'],
      ['status', '--refresh'],
    ]) {
      const { errors, sink } = io();
      expect(await execute(parsed(argv), d, sink)).toBe(2);
      expect(errors[0]).toContain(ledger.path);
    }
    expect(d.scripted.posted).toHaveLength(0);
    expect(d.scripted.retracted).toEqual([]);
    expect(ledger.saves).toBe(0);
    for (const argv of [
      ['ingest', 'notes.md', '--subject', 'Ada', '--dry-run'],
      ['retract', 'notes.md', '--dry-run'],
      ['status'],
    ]) {
      expect(await execute(parsed(argv), d, io().sink)).toBe(0);
    }

    ledger.held = false;
    expect(await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), d, io().sink)).toBe(0);
    expect(ledger.held).toBe(false);
    const down = deps({
      ledger,
      sink: {
        post: () => Promise.reject(new Error('not posted')),
        status: () => Promise.reject(new Error('the quality loop is unreachable: ECONNREFUSED')),
        retract: () => Promise.resolve(0),
      },
    });
    await expect(execute(parsed(['status', '--refresh']), down, io().sink)).rejects.toThrow(
      'unreachable',
    );
    expect(ledger.held).toBe(false);
  });
});
