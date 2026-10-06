import type { BrowserSessionDetailDto, BrowserSessionDto } from '@sysdesign/contracts';

import { DEFAULT_RAILS } from './config';
import { liveness, renderOutcome, renderSession, renderSessions } from './render';

const NOW = new Date('2026-10-03T10:05:00.000Z');

const session = (overrides: Partial<BrowserSessionDto> = {}): BrowserSessionDto => ({
  id: 'session-1',
  dumpRunId: 'dump-1',
  goalPath: 'goals/smoke-search.md',
  goalHash: 'abcdef0123456789',
  profile: 'smoke',
  headed: true,
  status: 'complete',
  terminationReason: 'mission-complete',
  terminationDetail: 'results shown',
  limits: DEFAULT_RAILS,
  steps: 3,
  startedAt: '2026-10-03T10:00:00.000Z',
  heartbeatAt: '2026-10-03T10:04:00.000Z',
  finishedAt: '2026-10-03T10:04:00.000Z',
  error: null,
  ...overrides,
});

describe('the CLI renderer', () => {
  it('[BRW-5] shows a running session live or stale by its beat, never by its status alone', () => {
    const live = session({
      status: 'running',
      finishedAt: null,
      heartbeatAt: '2026-10-03T10:04:30.000Z',
    });
    const stale = session({
      status: 'running',
      finishedAt: null,
      heartbeatAt: '2026-10-03T10:03:00.000Z',
    });
    expect(liveness(live, NOW)).toBe('running (live)');
    expect(liveness(stale, NOW)).toBe('running (stale)');
    expect(liveness(session(), NOW)).toBe('complete');
    const text = renderSessions([live, stale, session()], NOW);
    expect(text).toMatch(/id\s+started\s+status\s+ended by\s+steps\s+profile\s+goal\s+duration/);
    expect(text).toContain('running (live)');
    expect(text).toContain('running (stale)');
    expect(text).toContain('4.0 min');
    expect(renderSessions([], NOW)).toBe('no sessions yet');
  });

  it('renders one session with its rails, units of work and decisions', () => {
    const detail: BrowserSessionDetailDto = {
      ...session({ error: { name: 'Error', message: 'boom' } }),
      tasks: [
        {
          id: 't1',
          sessionId: 'session-1',
          ordinal: 1,
          label: 'Senior Engineer at Acme',
          externalRef: 'https://jobs.example.test/42',
          status: 'complete',
          outcome: 'done',
          startStep: 2,
          endStep: 4,
          startedAt: '2026-10-03T10:01:00.000Z',
          finishedAt: '2026-10-03T10:03:00.000Z',
        },
      ],
      decisions: [
        {
          id: 'd1',
          sessionId: 'session-1',
          taskId: 't1',
          step: 3,
          ordinal: 2,
          kind: 'field-answer',
          source: 'operator',
          loopRunId: 'run-9',
          loopOrchestrationId: 'orch-9',
          teachOrchestrationId: 'teach-1',
          ref: 'e2',
          question: 'Work authorisation',
          answer: 'Yes',
          confidence: 'low',
          payload: {},
          durationMs: 1200,
          createdAt: '2026-10-03T10:02:00.000Z',
        },
      ],
    };
    const text = renderSession(detail, NOW);
    expect(text).toContain(
      'session session-1 · complete · ended by mission-complete: results shown',
    );
    // Read from the declaration: the rails line reports what was declared, and
    // a spec that retypes the numbers only ever tests the retyping.
    expect(text).toContain(
      `rails: ${DEFAULT_RAILS.maxTasks} tasks · ${DEFAULT_RAILS.maxMinutes} min · ${DEFAULT_RAILS.maxConsecutiveFailures} failures · ${DEFAULT_RAILS.maxBrainFaults} brain faults`,
    );
    expect(text).toContain('error: Error: boom');
    expect(text).toMatch(/1\s+Senior Engineer at Acme\s+complete\s+done\s+2–4/);
    expect(text).toMatch(
      /3\.2\s+field-answer\s+operator\s+run-9\s+e2\s+Work authorisation\s+Yes\s+low\s+teach-1/,
    );
    expect(renderSession({ ...session(), tasks: [], decisions: [] }, NOW)).toContain(
      'no units of work',
    );
  });

  it('renders an outcome in one breath', () => {
    expect(
      renderOutcome({
        sessionId: 's',
        dumpRunId: 'd',
        status: 'stopped',
        termination: { reason: 'max-tasks', detail: '2 of 2' },
        steps: 7,
      }),
    ).toBe('session s stopped after 7 step(s) — max-tasks: 2 of 2\ndump d');
  });
});
