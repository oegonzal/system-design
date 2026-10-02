import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { listDump, MAX_DUMP_FILE_BYTES, readDumpFile } from './read-dump';
import { isRunId, makeRunId } from './run-id';
import { writeDump, type BuiltDump } from './write-dump';

const RUN_ID = '2026-09-01T07-20-05-880-9f3c2a-quality';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sysdesign-read-dump-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const dump = (files: BuiltDump['files']): BuiltDump => ({
  runId: RUN_ID,
  files,
  indexRow: `{"runId":"${RUN_ID}"}\n`,
});

const written = (files: BuiltDump['files']): string => {
  const dir = tempDir();
  writeDump(dump(files), dir);
  return dir;
};

describe('reading a run folder back', () => {
  it('[QL-30] lists exactly what the writer wrote, sorted, with byte counts', async () => {
    const dir = written([
      { path: 'manifest.json', content: '{"runId":"x"}\n' },
      { path: '05-llm/02.producer.1.user.txt', content: 'second' },
      { path: '05-llm/01.criteria.1.user.txt', content: 'first' },
      { path: '04-iterations/01/artifact.json', content: '{"a":1}' },
    ]);
    expect(await listDump(dir, RUN_ID)).toEqual([
      { path: '04-iterations/01/artifact.json', bytes: 7 },
      { path: '05-llm/01.criteria.1.user.txt', bytes: 5 },
      { path: '05-llm/02.producer.1.user.txt', bytes: 6 },
      { path: 'manifest.json', bytes: 14 },
    ]);
  });

  it('[QL-30] serves a file by the exact name a listing gave, as text and never parsed', async () => {
    const dir = written([{ path: 'manifest.json', content: '{"runId":"x"}\n' }]);
    expect(await readDumpFile(dir, RUN_ID, 'manifest.json')).toEqual({
      path: 'manifest.json',
      bytes: 14,
      // Text, not an object: parsing is what turns bytes into the loop's types,
      // and a trail must be readable even when a file of it is malformed.
      text: '{"runId":"x"}\n',
      problem: null,
    });
    const broken = written([{ path: 'half.json', content: '{"runId":' }]);
    expect((await readDumpFile(broken, RUN_ID, 'half.json'))?.text).toBe('{"runId":');
  });

  it('[QL-30] a path outside the folder is not refused — it simply is not a key', async () => {
    const dir = written([{ path: 'manifest.json', content: '{}' }]);
    writeFileSync(join(dir, 'secrets.txt'), 'do not serve me');
    for (const attempt of [
      '../secrets.txt',
      '../../etc/passwd',
      '/etc/passwd',
      './manifest.json',
      'manifest.json/',
      '',
    ]) {
      expect(await readDumpFile(dir, RUN_ID, attempt), attempt).toBeNull();
    }
    // The only names that work are the ones the listing published.
    const [entry] = (await listDump(dir, RUN_ID)) ?? [];
    expect((await readDumpFile(dir, RUN_ID, entry.path))?.text).toBe('{}');
  });

  it('[QL-30] a run id this package could not have minted never becomes a path', async () => {
    const dir = written([{ path: 'manifest.json', content: '{}' }]);
    // Checked before any syscall, so a traversal through the id is impossible too.
    for (const id of ['..', '../..', 'not-a-run', `${RUN_ID}/..`, '']) {
      expect(await listDump(dir, id), id).toBeNull();
      expect(await readDumpFile(dir, id, 'manifest.json'), id).toBeNull();
    }
    expect(isRunId(RUN_ID)).toBe(true);
    // The grammar is the writer's own, so an id it mints is always readable.
    expect(isRunId(makeRunId(Date.parse('2026-09-01T07:20:05.880Z'), 'quality', () => 0.5))).toBe(
      true,
    );
  });

  it('[QL-30] a folder that is not there is absence, and says nothing about the run', async () => {
    const dir = tempDir();
    // The two stores legitimately diverge: a folder is the loop's, a row the
    // database's, so "no dump" is the honest answer and "no run" would be a guess.
    expect(await listDump(dir, RUN_ID)).toBeNull();
    expect(await readDumpFile(dir, RUN_ID, 'manifest.json')).toBeNull();
  });

  it('[QL-30] a file too large to serve comes back in band, with no stack and no server path', async () => {
    const dir = tempDir();
    mkdirSync(join(dir, RUN_ID), { recursive: true });
    writeFileSync(join(dir, RUN_ID, 'huge.txt'), 'x'.repeat(MAX_DUMP_FILE_BYTES + 1));
    const read = await readDumpFile(dir, RUN_ID, 'huge.txt');
    expect(read).toMatchObject({ path: 'huge.txt', text: null });
    expect(read?.problem).toContain('past the');
    expect(read?.problem).not.toContain(dir);
    // The listing still names it, because the name is most of the answer.
    expect((await listDump(dir, RUN_ID))?.map((entry) => entry.path)).toEqual(['huge.txt']);
  });

  it('[QL-30] a symbolic link is not a key, so no file inside can name bytes outside', async () => {
    const dir = tempDir();
    mkdirSync(join(dir, RUN_ID), { recursive: true });
    writeFileSync(join(dir, 'outside.txt'), 'outside');
    writeFileSync(join(dir, RUN_ID, 'real.txt'), 'inside');
    symlinkSync(join(dir, 'outside.txt'), join(dir, RUN_ID, 'link.txt'));
    expect((await listDump(dir, RUN_ID))?.map((entry) => entry.path)).toEqual(['real.txt']);
    expect(await readDumpFile(dir, RUN_ID, 'link.txt')).toBeNull();
  });
});
