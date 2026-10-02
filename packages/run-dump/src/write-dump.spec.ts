import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { isRunId, makeRunId, makeRunStamp } from './run-id';
import { capText, describeError, jsonSafe, MAX_TEXT_BYTES } from './serialize';
import {
  appendIndexRow,
  gitContext,
  INDEX_FILE,
  writeDump,
  writeDumpFiles,
  type BuiltDump,
} from './write-dump';

// Stands in for git, so the spec can count what `gitContext` spawns.
const execFileSync = vi.hoisted(() => vi.fn(() => 'main\n'));
vi.mock('node:child_process', () => ({ execFileSync }));

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sysdesign-run-dump-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function dump(overrides: Partial<BuiltDump> = {}): BuiltDump {
  return {
    runId: '2026-09-01T07-20-05-880-9f3c2a-quality',
    files: [
      { path: 'manifest.json', content: '{"runId":"x"}\n' },
      { path: '06-llm/01.llm.critic.1.system.txt', content: 'You are a critic.' },
    ],
    indexRow: `${JSON.stringify({ runId: 'x', kind: 'quality' })}\n`,
    ...overrides,
  };
}

describe('makeRunStamp', () => {
  it('sorts chronologically as a plain string, across a day boundary', () => {
    const before = makeRunStamp(Date.parse('2026-08-31T23:59:59.000Z'), () => 0.9);
    const after = makeRunStamp(Date.parse('2026-09-01T00:00:01.000Z'), () => 0.1);
    // The suffix is deliberately the LARGER one on the earlier run: ordering
    // must come from the stamp, never from the tiebreaker.
    expect([after, before].sort()).toEqual([before, after]);
  });

  it('has no characters a filesystem or a shell would fight over', () => {
    expect(makeRunStamp(Date.now(), () => 0.5)).toMatch(/^[A-Za-z0-9-]+$/);
  });

  /** The code review's `.code-review/runs` records are named by the bare stamp; their ids must not drift. */
  it('keeps the stamp-and-suffix format the recorded runs already use', () => {
    expect(makeRunStamp(Date.parse('2026-08-27T10:00:00.000Z'), () => 0.5)).toBe(
      '2026-08-27T10-00-00-000-7fffff',
    );
  });

  it('names a dump folder by its stamp and kind', () => {
    const now = Date.parse('2026-09-01T07:20:05.880Z');
    expect(makeRunId(now, 'quality', () => 0)).toBe(`${makeRunStamp(now, () => 0)}-quality`);
  });

  it("[BRW-6] mints and reads back a browser session's id by the same grammar as a run's", () => {
    const id = makeRunId(Date.parse('2026-10-02T21:00:00.000Z'), 'session', () => 0.5);
    expect(id.endsWith('-session')).toBe(true);
    expect(isRunId(id)).toBe(true);
    expect(isRunId(id.replace('-session', '-browser'))).toBe(false);
  });
});

describe('serialize', () => {
  it('survives a circular structure instead of throwing', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular['self'] = circular;
    expect(jsonSafe(circular)).toEqual({ unserializable: expect.stringContaining('circular') });
  });

  it('keeps an Error readable — stringifying one directly yields {}', () => {
    expect(JSON.stringify(new Error('boom'))).toBe('{}');
    expect(describeError(new Error('boom'))).toMatchObject({ name: 'Error', message: 'boom' });
    expect(describeError('a thrown string')).toMatchObject({ name: 'UnknownError' });
  });

  it('caps a pathological field and says what was lost', () => {
    const capped = capText('x'.repeat(MAX_TEXT_BYTES + 500));
    expect(capped.truncated).toBe(true);
    expect(capped.originalBytes).toBe(MAX_TEXT_BYTES + 500);
    expect(Buffer.byteLength(capped.text, 'utf8')).toBe(MAX_TEXT_BYTES);
  });

  it('cuts on a byte boundary without producing invalid UTF-8', () => {
    // A 2-byte character straddling the cap: the slice must still decode.
    const capped = capText('é'.repeat(10), 5);
    expect(() => JSON.stringify(capped.text)).not.toThrow();
    expect(Buffer.byteLength(capped.text, 'utf8')).toBeLessThanOrEqual(5);
  });
});

describe('writeDump', () => {
  it('writes every file, creating nested folders', () => {
    const dir = tempDir();
    const { runDir } = writeDump(dump(), dir);

    expect(readFileSync(join(runDir, 'manifest.json'), 'utf8')).toBe('{"runId":"x"}\n');
    expect(readFileSync(join(runDir, '06-llm/01.llm.critic.1.system.txt'), 'utf8')).toBe(
      'You are a critic.',
    );
  });

  /**
   * A worker killed mid-write must not leave half a JSON file behind for every
   * later reader to trip over — so each file lands through a rename.
   */
  it('leaves no temp files behind', () => {
    const dir = tempDir();
    const { runDir } = writeDump(dump(), dir);
    const all = [...readdirSync(runDir), ...readdirSync(join(runDir, '06-llm'))];
    expect(all.filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('appends exactly one index line per run', () => {
    const dir = tempDir();
    writeDump(dump(), dir);
    writeDump(dump({ runId: 'second-run-quality' }), dir);

    const rows = readFileSync(join(dir, INDEX_FILE), 'utf8').split('\n').filter(Boolean);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => JSON.parse(row))).toBe(true);
  });

  it('indexes a run only after its folder is whole', () => {
    // A dump root that is a file, so no run folder can be created under it.
    const blocked = join(tempDir(), 'not-a-directory');
    writeFileSync(blocked, 'x');

    expect(() => writeDump(dump(), blocked)).toThrow();
    // The row is appended last, so a failed write leaves nothing claiming to be
    // a complete run.
    expect(existsSync(join(blocked, INDEX_FILE))).toBe(false);
  });
});

describe('writeDumpFiles', () => {
  it('[BRW-6] writes bytes as well as text, through the same temp-and-rename, and indexes nothing', () => {
    const dir = tempDir();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { runDir } = writeDumpFiles(
      'x-session',
      [
        { path: '01-steps/01/screenshot.png', bytes: png },
        { path: '01-steps/01/plan.json', content: '{}' },
      ],
      dir,
    );
    expect(new Uint8Array(readFileSync(join(runDir, '01-steps/01/screenshot.png')))).toEqual(png);
    expect(readdirSync(join(runDir, '01-steps/01')).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(existsSync(join(dir, INDEX_FILE))).toBe(false);
  });

  it('[BRW-6] lets a writer fill a folder step by step and claim it complete once', () => {
    const dir = tempDir();
    writeDumpFiles('x-session', [{ path: '01-steps/01/plan.json', content: '{}' }], dir);
    writeDumpFiles('x-session', [{ path: '01-steps/02/plan.json', content: '{}' }], dir);
    appendIndexRow(`${JSON.stringify({ runId: 'x-session', kind: 'session' })}\n`, dir);

    expect(readdirSync(join(dir, 'x-session', '01-steps'))).toEqual(['01', '02']);
    const rows = readFileSync(join(dir, INDEX_FILE), 'utf8').split('\n').filter(Boolean);
    expect(rows).toHaveLength(1);
  });
});

describe('gitContext', () => {
  it('spawns nothing at import, then reads git once and serves it from memory', () => {
    expect(execFileSync).not.toHaveBeenCalled();
    const first = gitContext();
    expect(first).toEqual({ branch: 'main', headSha: 'main' });
    expect(gitContext()).toBe(first);
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });
});
