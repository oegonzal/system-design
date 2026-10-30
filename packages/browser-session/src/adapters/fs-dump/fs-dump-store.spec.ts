import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listingObservation, type BrowserTaskDto } from '@sysdesign/contracts';
import { INDEX_FILE, isRunId } from '@sysdesign/run-dump';

import {
  closingFiles,
  dumpedTasks,
  indexRowOf,
  manifestOf,
  observationFiles,
} from '../../core/session-dump';
import { fsDumpStore } from './fs-dump-store';

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
      targetDone: null,
      maxTasks: 1,
      maxMinutes: 1,
      unitGraceMinutes: 0,
      maxConsecutiveFailures: 1,
      maxBrainFaults: 1,
      maxUnreadablePages: 1,
      maxStalledSteps: 1,
    },
    settings: { capture: 'packages/browser-session/config/capture/field-entries.json' },
    steps: 2,
    tasks: { started: 1, closed: 1 },
    decisions: 3,
    unsentEvents: [],
    startedAt: new Date('2026-10-03T10:00:00.000Z'),
    finishedAt: new Date('2026-10-03T10:05:00.000Z'),
    error: null,
  });

/** One unit of work as the ledger reads it back, every fact the quiet default. */
const taskRow = (id: string): BrowserTaskDto => ({
  id,
  sessionId: 'session-1',
  ordinal: 1,
  label: 'Senior Engineer at Acme',
  externalRef: 'https://jobs.example.test/apply/42',
  facets: [{ name: 'company', value: 'Acme' }],
  status: 'complete',
  outcome: 'done',
  startStep: 2,
  endStep: 4,
  startedAt: '2026-10-03T10:01:00.000Z',
  finishedAt: '2026-10-03T10:04:00.000Z',
});

describe('the session dump on disk', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'browser-session-dump-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

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
    // The units as the ledger holds them, each beside what the page stated about it when it opened.
    const contexts = new Map([
      [
        'task-1',
        { landmark: 'main' as const, text: 'Acme builds tools for teams.\nRemote', omitted: 2 },
      ],
    ]);
    sink.write(
      closingFiles(
        { ...built, runId: sink.runId },
        '# Mission\n',
        dumpedTasks([taskRow('task-1'), { ...taskRow('task-2'), ordinal: 2 }], contexts),
      ),
    );
    expect(JSON.parse(readFileSync(join(dir, sink.runId, '02-tasks.json'), 'utf8'))).toEqual([
      {
        ...taskRow('task-1'),
        context: { landmark: 'main', text: 'Acme builds tools for teams.\nRemote', omitted: 2 },
      },
      { ...taskRow('task-2'), ordinal: 2, context: null },
    ]);
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
