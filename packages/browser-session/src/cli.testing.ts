import type { BrowserSessionDto } from '@sysdesign/contracts';

import { parseOptions, type LaunchSource, type Options } from './cli';
import { SessionConfigError } from './config';
import { SPEC_LIVENESS, SPEC_RAILS } from './core/testing-session';
import type { SessionOutcome } from './core/session-engine';
import type { Launch } from './launch';
import type { ReplayFieldsReport } from './modules/session/replay-fields';
import type { TeachAgainReport } from './modules/session/teach-again';
import type { SessionDefaults } from './settings';

/**
 * What the CLI specs parse and execute over: the settings a parse reads its
 * defaults from, the launch files as a table, and what the fake service
 * answers. No vitest import, so either spec can use it.
 */

/** The settings a parse reads its defaults from. */
const AT_ONCE = { windowMs: 0, pauseMs: 1 };
export const DEFAULTS: SessionDefaults = {
  headed: true,
  rails: SPEC_RAILS,
  loopRecovery: AT_ONCE,
  advisorRecovery: AT_ONCE,
  busRecovery: AT_ONCE,
  liveness: SPEC_LIVENESS,
};
/** What a listing reads a session's beat against: the declared stale window. */
export const STALE = { staleAfterMs: SPEC_LIVENESS.staleAfterMs };

/** The launch files a parse reads, as a table: what `readLaunch` answers from the package's own. */
export const LAUNCHES: Record<string, Launch> = {
  linkedin: {
    name: 'linkedin',
    goal: 'goals/linkedin.md',
    profile: 'linkedin',
    url: 'https://jobs.test/linkedin',
    documents: [],
    targetDone: 6,
    maxTasks: 9,
    maxMinutes: 120,
  },
  builtin: {
    name: 'builtin',
    goal: 'goals/builtin.md',
    profile: 'builtin',
    url: 'https://jobs.test/builtin',
    documents: [{ name: 'resume', path: 'docs/Resume.pdf' }],
    targetDone: 4,
    maxTasks: 8,
    maxMinutes: 90,
  },
};
export const launchOf: LaunchSource = {
  named: (name) => {
    const launch = LAUNCHES[name];
    if (launch === undefined) {
      throw new SessionConfigError(
        `--launch "${name}" names no launch file; known: builtin, linkedin`,
      );
    }
    return launch;
  },
  all: () => Object.values(LAUNCHES),
};

export const parsed = (argv: string[]): Options => {
  const options = parseOptions(argv, DEFAULTS, launchOf);
  if (options instanceof Error) throw options;
  return options;
};

export const session = (overrides: Partial<BrowserSessionDto> = {}): BrowserSessionDto => ({
  id: 'session-1',
  dumpRunId: '2026-10-03T10-00-00-000-abcdef-session',
  goalPath: 'goals/smoke-search.md',
  goalHash: 'abc123',
  profile: 'smoke',
  subject: null,
  headed: true,
  status: 'complete',
  terminationReason: 'mission-stop',
  terminationCause: 'mission-complete',
  terminationDetail: 'results shown',
  limits: SPEC_RAILS,
  steps: 3,
  startedAt: '2026-10-03T10:00:00.000Z',
  heartbeatAt: '2026-10-03T10:04:00.000Z',
  finishedAt: '2026-10-03T10:04:00.000Z',
  error: null,
  ...overrides,
});

/** What a replay reports, as the fake service answers it. */
export const REPLAYED: ReplayFieldsReport = {
  fields: 12,
  pages: 3,
  citedFound: 9,
  cited: 10,
  citedBy: { equal: 7, identity: 2, contained: 0 },
  unitLeak: 0,
  tenantLeak: 0,
  latency: { p50: 120, p90: 310 },
  recordedLatency: { p50: 400, p90: 900 },
  judged: null,
  unresolvedRuns: 1,
  unresolvedOrchestrations: 0,
  retraction: null,
  outDir: 'static/replays/2026-10-24T10-00-00-000-abcdef',
};

/** What teach-again reports, as the fake service answers it: nineteen answers, each its own receipt. */
export const taughtAgain = (dryRun: boolean): TeachAgainReport => ({
  dryRun,
  sessions: 2,
  answers: 19,
  documents: 3,
  outcomes: dryRun ? {} : { queued: 19 },
  scopes: { declared: 19, fromDigest: 0, undeclared: 0 },
  stored: dryRun ? 0 : 18,
  retracted: dryRun ? 0 : 4,
  unanswered: 40,
  untaught: 0,
  unreadable: [],
  skipped: ['x-session: 3 answer(s) but 0 teaching(s) — taught without linking rows or retracting'],
});

export const outcome = (status: SessionOutcome['status']): SessionOutcome => ({
  sessionId: 'session-1',
  dumpRunId: 'dump-1',
  status,
  termination:
    status === 'failed'
      ? { reason: 'error', detail: 'x' }
      : { reason: 'mission-stop', cause: 'mission-complete', ending: 'complete', detail: 'x' },
  steps: 3,
});
