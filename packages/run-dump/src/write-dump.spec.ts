import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { makeRunId } from './run-id';
import { capText, describeError, jsonSafe, MAX_TEXT_BYTES } from './serialize';
import { dumpDir, findPromptRunId, INDEX_FILE, writeDump, type BuiltDump } from './write-dump';

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
    runId: '2026-09-01T07-20-05-880-9f3c2a-eval',
    files: [
      { path: 'manifest.json', content: '{"runId":"x"}\n' },
      { path: '06-llm/01.llm.critic.1.system.txt', content: 'You are a critic.' },
    ],
    indexRow: `${JSON.stringify({ runId: 'x', kind: 'eval' })}\n`,
    ...overrides,
  };
}

describe('makeRunId', () => {
  it('sorts chronologically as a plain string, across a day boundary', () => {
    const before = makeRunId(Date.parse('2026-08-31T23:59:59.000Z'), 'eval', () => 0.9);
    const after = makeRunId(Date.parse('2026-09-01T00:00:01.000Z'), 'eval', () => 0.1);
    // The suffix is deliberately the LARGER one on the earlier run: ordering
    // must come from the stamp, never from the tiebreaker.
    expect([after, before].sort()).toEqual([before, after]);
  });

  it('names the kind so a listing distinguishes the two pipelines', () => {
    const now = Date.parse('2026-09-01T07:20:05.880Z');
    expect(makeRunId(now, 'prompt', () => 0)).toMatch(/-prompt$/);
    expect(makeRunId(now, 'eval', () => 0)).toMatch(/-eval$/);
  });

  it('has no characters a filesystem or a shell would fight over', () => {
    expect(makeRunId(Date.now(), 'eval', () => 0.5)).toMatch(/^[A-Za-z0-9-]+$/);
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
    writeDump(dump({ runId: 'second-run-eval' }), dir);

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

describe('findPromptRunId', () => {
  it('returns the newest run for a prompt, and null when there is none', () => {
    const dir = tempDir();
    writeDump(
      dump({
        runId: 'older-prompt',
        indexRow: `${JSON.stringify({ runId: 'older-prompt', kind: 'prompt', promptId: 'pr-1' })}\n`,
      }),
      dir,
    );
    writeDump(
      dump({
        runId: 'newer-prompt',
        indexRow: `${JSON.stringify({ runId: 'newer-prompt', kind: 'prompt', promptId: 'pr-1' })}\n`,
      }),
      dir,
    );

    expect(findPromptRunId('pr-1', dir)).toBe('newer-prompt');
    expect(findPromptRunId('pr-missing', dir)).toBeNull();
  });

  it('ignores eval rows, which carry a promptId too', () => {
    const dir = tempDir();
    writeDump(
      dump({
        runId: 'an-eval',
        indexRow: `${JSON.stringify({ runId: 'an-eval', kind: 'eval', promptId: 'pr-2' })}\n`,
      }),
      dir,
    );
    expect(findPromptRunId('pr-2', dir)).toBeNull();
  });

  /** Never worth failing a run over: a missing or corrupt index is just absent. */
  it('is silent when there is no index, or a row will not parse', () => {
    const dir = tempDir();
    expect(findPromptRunId('pr-1', dir)).toBeNull();

    writeFileSync(join(dir, INDEX_FILE), 'not json at all\n');
    expect(findPromptRunId('pr-1', dir)).toBeNull();
  });
});

describe('dumpDir', () => {
  it('defaults to the repo tree and honours the override tests rely on', () => {
    expect(dumpDir({})).toBe(join(process.cwd(), 'static', 'runs'));
    expect(dumpDir({ EVAL_DUMP_DIR: '/tmp/elsewhere' })).toBe('/tmp/elsewhere');
  });
});
