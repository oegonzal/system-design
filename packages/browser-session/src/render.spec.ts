import type { BrowserSessionDetailDto, BrowserSessionDto } from '@sysdesign/contracts';

import { SPEC_LIVENESS, SPEC_RAILS } from './core/testing-session';
import type { ReplayFieldsReport } from './modules/session/replay-fields';
import type { TeachAgainReport } from './modules/session/teach-again';
import {
  liveness,
  renderOutcome,
  renderReplayFields,
  renderSession,
  renderSessions,
  renderTeachAgain,
} from './render';

const NOW = new Date('2026-10-03T10:05:00.000Z');
const STALE_AFTER_MS = SPEC_LIVENESS.staleAfterMs;

const session = (overrides: Partial<BrowserSessionDto> = {}): BrowserSessionDto => ({
  id: 'session-1',
  dumpRunId: 'dump-1',
  goalPath: 'goals/smoke-search.md',
  goalHash: 'abcdef0123456789',
  profile: 'smoke',
  subject: 'Alex Example',
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
    expect(liveness(live, NOW, STALE_AFTER_MS)).toBe('running (live)');
    expect(liveness(stale, NOW, STALE_AFTER_MS)).toBe('running (stale)');
    expect(liveness(session(), NOW, STALE_AFTER_MS)).toBe('complete');
    const text = renderSessions([live, stale, session()], NOW, STALE_AFTER_MS);
    expect(text).toMatch(/id\s+started\s+status\s+ended by\s+steps\s+profile\s+goal\s+duration/);
    expect(text).toContain('running (live)');
    expect(text).toContain('running (stale)');
    expect(text).toContain('4.0 min');
    expect(renderSessions([], NOW, STALE_AFTER_MS)).toBe('no sessions yet');
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
          facets: [{ name: 'company', value: 'Acme' }],
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
          teachingRef: 'teach-1',
          ref: 'e2',
          question: 'Work authorisation',
          answer: 'Yes',
          rests: 'inferred',
          payload: {},
          durationMs: 1200,
          createdAt: '2026-10-03T10:02:00.000Z',
        },
      ],
    };
    const text = renderSession(detail, NOW, STALE_AFTER_MS);
    expect(text).toContain(
      "session session-1 · complete · ended by the mission's stop mission-complete: results shown",
    );
    // Read from the declaration: the rails line reports what was declared, and
    // a spec that retypes the numbers only ever tests the retyping.
    expect(text).toContain(
      `rails: ${SPEC_RAILS.maxTasks} tasks · ${SPEC_RAILS.maxMinutes} min · ${SPEC_RAILS.maxConsecutiveFailures} failures · ${SPEC_RAILS.maxBrainFaults} brain faults`,
    );
    expect(text).not.toContain('target');
    expect(text).toContain('error: Error: boom');
    // A session with a target says so on its rails line.
    const targeted = renderSession(
      {
        ...detail,
        limits: { ...SPEC_RAILS, targetDone: 5, maxTasks: 6 },
        terminationReason: 'target-reached',
        terminationCause: null,
        terminationDetail: '5 of 5 units of work closed done',
      },
      NOW,
      STALE_AFTER_MS,
    );
    expect(targeted).toContain('3 brain faults · target 5 done');
    // A session with a unit grace says so beside its limit.
    const graced = renderSession(
      { ...detail, limits: { ...SPEC_RAILS, unitGraceMinutes: 30 } },
      NOW,
      STALE_AFTER_MS,
    );
    expect(graced).toContain(`${SPEC_RAILS.maxMinutes} min + 30 for an open unit ·`);
    expect(targeted).toContain('ended by target-reached: 5 of 5 units of work closed done');
    expect(text).toMatch(/1\s+Senior Engineer at Acme\s+company=Acme\s+complete\s+done\s+2–4/);
    expect(text).toContain('subject Alex Example');
    expect(text).toMatch(
      /3\.2\s+field-answer\s+operator\s+run-9\s+e2\s+Work authorisation\s+Yes\s+inferred\s+teach-1/,
    );
    expect(
      renderSession({ ...session(), tasks: [], decisions: [] }, NOW, STALE_AFTER_MS),
    ).toContain('no units of work');
  });

  it('[BRW-17] says what teach-again did: the receipts by outcome, the loop’s digests only where a document was queued there, and what was skipped', () => {
    const report: TeachAgainReport = {
      dryRun: false,
      sessions: 2,
      answers: 19,
      documents: 3,
      outcomes: { queued: 19 },
      scopes: { declared: 12, fromDigest: 5, undeclared: 2 },
      stored: 9,
      retracted: 1,
      unanswered: 1,
      untaught: 2,
      unreadable: [],
      skipped: [
        'x-session: 17 answer(s) but 16 teaching(s) — taught without linking rows or retracting',
      ],
    };
    const scopes =
      "scopes: 12 declared · 5 from the earlier digests · 2 undeclared, left to the brain's rule";
    expect(renderTeachAgain(report)).toBe(
      `19 answer(s) in 2 session(s) taught again as 3 document(s): queued 19 — 9 fact(s) kept by the loop's digests, 1 earlier digest(s) retracted; ${scopes}; 1 dump(s) held no answer; 2 answer(s) on a channel the operator settings do not teach, left as they were; x-session: 17 answer(s) but 16 teaching(s) — taught without linking rows or retracting`,
    );
    // A memory-backed brain writes the answers itself: one receipt per answer in the memory's words, no digest to speak of.
    expect(
      renderTeachAgain({
        ...report,
        outcomes: { inserted: 12, unchanged: 6, refused: 1 },
        stored: 0,
        retracted: 0,
        unanswered: 0,
        untaught: 0,
        skipped: [],
      }),
    ).toBe(
      `19 answer(s) in 2 session(s) taught again as 3 document(s): inserted 12 · unchanged 6 · refused 1; ${scopes}`,
    );
    // An item this build could not read is counted and named, taught by nobody.
    expect(
      renderTeachAgain({
        ...report,
        unreadable: ['y-session: step 03: field 2 — context.page Invalid input: expected string'],
      }),
    ).toContain(
      '; 1 recorded item(s) this build could not read: y-session: step 03: field 2 — context.page Invalid input: expected string;',
    );
    expect(
      renderTeachAgain({ ...report, dryRun: true, outcomes: {}, stored: 0, retracted: 0 }),
    ).toBe(
      `19 answer(s) in 2 session(s) would be taught again as 3 document(s); nothing was posted; ${scopes}; 1 dump(s) held no answer; 2 answer(s) on a channel the operator settings do not teach, left as they were; x-session: 17 answer(s) but 16 teaching(s) — taught without linking rows or retracting`,
    );
  });

  it('renders a replay as the acceptance table’s numbers, a line each, naming the runs it could not compare and where it wrote', () => {
    const report: ReplayFieldsReport = {
      fields: 261,
      pages: 209,
      citedFound: 248,
      cited: 261,
      citedBy: { equal: 200, identity: 40, contained: 8 },
      unitLeak: 0,
      tenantLeak: 0,
      latency: { p50: 412.4, p90: 1180 },
      recordedLatency: { p50: 500, p90: 1400 },
      judged: { filled: 30, asked: 12, wrong: 0 },
      unresolvedRuns: 3,
      unresolvedOrchestrations: 2,
      retraction: { sampled: 20, recalledAfter: 0, lineageShown: 20, faults: [] },
      outDir: 'static/replays/2026-10-24T10-00-00-000-abcdef',
    };
    expect(renderReplayFields(report)).toBe(
      [
        '261 field(s) over 209 page(s) replayed',
        'cited evidence found again: 248 of 261 (95.0%)',
        "found by: 200 the same words · 40 the same identity · 8 the fact's words contained",
        'leaks: 0 unit · 0 tenant',
        'recall latency per page: p50 412 ms · p90 1180 ms — recorded p50 500 ms · p90 1400 ms',
        'judged: 30 filled · 12 asked · 0 wrong',
        'retraction: 20 closed · 0 recalled after · 20 shown closed by history',
        '3 recorded run(s) the loop no longer holds: their cited evidence was not compared',
        '2 recorded orchestration(s) the loop no longer holds: their recall latency was not read',
        'rows and report under static/replays/2026-10-24T10-00-00-000-abcdef',
      ].join('\n'),
    );
    // A refused close is counted on its line.
    expect(
      renderReplayFields({
        ...report,
        retraction: { sampled: 20, recalledAfter: 1, lineageShown: 19, faults: ['r-1: closed'] },
      }),
    ).toContain(
      'retraction: 20 closed · 1 recalled after · 19 shown closed by history · 1 refused',
    );
    // Nothing judged, nothing cited, no page timed, nothing closed: said so, never divided by nothing.
    expect(
      renderReplayFields({
        ...report,
        cited: 0,
        citedFound: 0,
        citedBy: { equal: 0, identity: 0, contained: 0 },
        latency: { p50: null, p90: null },
        recordedLatency: { p50: null, p90: null },
        judged: null,
        unresolvedRuns: 0,
        unresolvedOrchestrations: 0,
        retraction: null,
      }),
    ).toBe(
      [
        '261 field(s) over 209 page(s) replayed',
        'cited evidence found again: nothing was cited',
        "found by: 0 the same words · 0 the same identity · 0 the fact's words contained",
        'leaks: 0 unit · 0 tenant',
        'recall latency per page: p50 n/a · p90 n/a — recorded p50 n/a · p90 n/a',
        'judged: nothing',
        'retraction: not measured',
        'rows and report under static/replays/2026-10-24T10-00-00-000-abcdef',
      ].join('\n'),
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
