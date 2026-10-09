import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listingObservation } from '@sysdesign/contracts';
import { INDEX_FILE, isRunId } from '@sysdesign/run-dump';

import {
  closingFiles,
  fsDumpStore,
  indexRowOf,
  manifestOf,
  observationFiles,
  stepFile,
  stepJsonFile,
} from './session-dump';

const manifest = () =>
  manifestOf({
    dumpRunId: 'x',
    sessionId: 'session-1',
    goalPath: 'goals/test.md',
    goalHash: 'abc',
    profile: 'spec',
    headed: false,
    status: 'complete',
    termination: {
      reason: 'mission-stop',
      cause: 'mission-complete',
      ending: 'complete',
      detail: 'done',
    },
    limits: {
      maxTasks: 1,
      maxMinutes: 1,
      maxConsecutiveFailures: 1,
      maxBrainFaults: 1,
      maxUnreadablePages: 1,
      maxStalledSteps: 1,
    },
    steps: 2,
    tasks: { started: 1, closed: 1 },
    decisions: 3,
    startedAt: new Date('2026-10-03T10:00:00.000Z'),
    finishedAt: new Date('2026-10-03T10:05:00.000Z'),
    error: null,
  });

describe('the session dump', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'browser-session-dump-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lays a step out as the observation without its snapshot, the snapshot as text and the screenshot as bytes', () => {
    const files = observationFiles(3, listingObservation(), new Uint8Array([1, 2, 3]));
    expect(files.map((file) => file.path)).toEqual([
      '01-steps/03/observation.json',
      '01-steps/03/snapshot.txt',
      '01-steps/03/screenshot.png',
    ]);
    const observation = files[0];
    expect(
      observation !== undefined && 'content' in observation && observation.content,
    ).not.toContain('ariaSnapshot');
    expect(observationFiles(1, listingObservation(), null)).toHaveLength(2);
    expect(stepJsonFile(12, 'plan', { a: 1 })).toEqual({
      path: stepFile(12, 'plan'),
      content: '{\n  "a": 1\n}\n',
    });
  });

  it('[BRW-6] fills a session folder step by step through the shared plumbing and claims it complete once, at the end', () => {
    const store = fsDumpStore(dir);
    const sink = store.open(new Date('2026-10-03T10:00:00.000Z'));
    expect(isRunId(sink.runId)).toBe(true);
    expect(sink.runId.endsWith('-session')).toBe(true);

    sink.write(observationFiles(1, listingObservation(), new Uint8Array([0x89, 0x50])));
    expect(existsSync(join(dir, INDEX_FILE))).toBe(false);
    expect(readdirSync(join(dir, sink.runId, '01-steps', '01')).sort()).toEqual([
      'observation.json',
      'screenshot.png',
      'snapshot.txt',
    ]);
    expect([...readFileSync(join(dir, sink.runId, '01-steps/01/screenshot.png'))]).toEqual([
      0x89, 0x50,
    ]);
    // No temp file is left behind: each landed by rename.
    expect(
      readdirSync(join(dir, sink.runId, '01-steps', '01')).some((f) => f.endsWith('.tmp')),
    ).toBe(false);

    sink.write(observationFiles(2, listingObservation(), null));
    const built = manifest();
    sink.write(closingFiles({ ...built, runId: sink.runId }, '# Mission\n', []));
    sink.index(indexRowOf({ ...built, runId: sink.runId }));
    const index = readFileSync(join(dir, INDEX_FILE), 'utf8').trim().split('\n');
    expect(index).toHaveLength(1);
    expect(JSON.parse(index[0] ?? '{}')).toEqual({
      runId: sink.runId,
      kind: 'session',
      at: '2026-10-03T10:05:00.000Z',
      status: 'complete',
      sessionId: 'session-1',
      termination: 'mission-stop',
      cause: 'mission-complete',
      steps: 2,
      tasks: 1,
      decisions: 3,
    });
    expect(JSON.parse(readFileSync(join(dir, sink.runId, 'manifest.json'), 'utf8'))).toMatchObject({
      kind: 'session',
      durationMs: 300_000,
      termination: { reason: 'mission-stop', cause: 'mission-complete', ending: 'complete' },
    });
    expect(readFileSync(join(dir, sink.runId, 'goal.md'), 'utf8')).toBe('# Mission\n');
  });
});
