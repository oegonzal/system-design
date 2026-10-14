import type { StubRoute } from '@sysdesign/web-testing';

import {
  makeEvaluation,
  makeHeartbeat,
  makePrompt,
  makeRevision,
  makeRevisionSummary,
  makeSession,
} from '../../testing/fixtures';

/** The practice page's API as its specs stub it: one session, its prompt, revisions and coaching runs. */

export const SESSION = '00000000-0000-4000-8000-000000000000';
export const SESSION_PATH = new RegExp(`^/api/sessions/${SESSION}$`);
export const AVAILABILITY = {
  method: 'GET',
  path: '/api/grading/availability',
  body: { data: { model: 'test-model', heartbeat: makeHeartbeat() } },
};

/** A session with one graded revision, and whatever the case adds. */
export function sessionRoutes(overrides: {
  session?: Partial<ReturnType<typeof makeSession>>;
  revisions?: ReturnType<typeof makeRevisionSummary>[];
  coachingRuns?: {
    runId: string;
    baseRevisionId: string;
    maxIterations: number;
    startedAt: string;
  }[];
  extra?: StubRoute[];
}): StubRoute[] {
  const revisions = overrides.revisions ?? [makeRevisionSummary()];
  return [
    {
      path: SESSION_PATH,
      body: { data: makeSession({ id: SESSION, ...overrides.session }) },
    },
    { path: '/api/prompts/prompt-1', body: { data: makePrompt() } },
    {
      path: `/api/sessions/${SESSION}/revisions`,
      body: { data: revisions, meta: { total: revisions.length, limit: 50, offset: 0 } },
    },
    { path: `/api/sessions/${SESSION}/improve`, body: { data: overrides.coachingRuns ?? [] } },
    { method: 'PUT', path: `/api/sessions/${SESSION}/draft`, status: 204 },
    { path: /^\/api\/revisions\/[^/]+$/, body: { data: makeRevision() } },
    { path: /^\/api\/revisions\/[^/]+\/evaluation$/, body: { data: makeEvaluation() } },
    AVAILABILITY,
    ...(overrides.extra ?? []),
  ];
}
