import {
  ADVISORS_HEADING,
  CONTEXT_HEADING,
  MISSION_WITH_IDENTITY,
  NO_UNITS_ON_RECORD,
  type UnitAdvice,
} from '@sysdesign/contracts';

import {
  advice,
  decidedAnswers,
  decidedPlan,
  InMemoryDumpStore,
  InMemoryLedger,
  ScriptedAdvisor,
} from './testing';
import { JOURNEY_ANSWERS as ANSWERS, JOURNEY_PLANS as PLANS } from './testing-journey';
import { runScripted as run, SPEC_SUBJECT, type Scenario } from './testing-session';
import { AdvisorFaulted, SessionRefused, type ConfiguredAdvisor } from './unit-advice';

const naming = (...advisors: string[]): string =>
  `${MISSION_WITH_IDENTITY}\n${ADVISORS_HEADING}\n\n${advisors.map((id) => `- ${id}`).join('\n')}\n`;
const MISSION = naming('record');
const RECORD = { id: 'record', facets: ['company'] };

const configured = (port: ScriptedAdvisor, id: string | null = 'record'): ConfiguredAdvisor => ({
  id,
  where: id === null ? 'http://advisor.test' : `${id}=http://advisor.test`,
  port,
});

const ACME: UnitAdvice = advice('record', [
  { name: 'company', value: 'Acme', stance: 'avoid', note: 'applied 2026-10-03' },
]);
const GLOBEX_FORBIDDEN: UnitAdvice = advice(
  'record',
  [{ name: 'company', value: 'Globex', stance: 'forbid', note: 'in progress in another session' }],
  3,
);
const JOURNEY = [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((plan) =>
  decidedPlan(plan),
);

describe('the advisors a mission names', () => {
  /** A session refused leaves nothing behind: no dump folder opened, no session row. */
  const refused = async (scenario: Scenario, message: RegExp): Promise<void> => {
    const dumps = new InMemoryDumpStore();
    const ledger = new InMemoryLedger();
    const failure: unknown = await run({ ...scenario, dumps, ledger }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(SessionRefused);
    expect((failure as Error).message).toMatch(message);
    expect([dumps.opened, ledger.sessions.size]).toEqual([0, 0]);
  };

  it('[BRW-14] refuses, before any row or folder, a mission naming an advisor nobody runs, one needing an undeclared fact, one that describes itself otherwise, one that gives no advice, a session with no subject of its own, and a section the grammar does not read', async () => {
    const script = { plans: [] };
    await refused(
      { script, mission: MISSION },
      /names the advisor record, and no configured advisor answers to it$/,
    );
    await refused(
      {
        script,
        mission: MISSION,
        advisors: [
          configured(new ScriptedAdvisor({ id: 'other', facets: ['company'] }, [ACME]), null),
        ],
      },
      /no configured advisor answers to it \(configured: other\)/,
    );
    await refused(
      {
        script,
        mission: MISSION,
        advisors: [configured(new ScriptedAdvisor({ id: 'other', facets: ['company'] }, [ACME]))],
      },
      /advisor record \(record=http:\/\/advisor\.test\) describes itself as other/,
    );
    await refused(
      {
        script,
        mission: MISSION,
        advisors: [
          configured(new ScriptedAdvisor({ id: 'record', facets: ['company', 'role'] }, [ACME])),
        ],
      },
      /advisor record keeps its record by role, which the mission's Unit identity does not declare/,
    );
    await refused(
      {
        script,
        mission: MISSION,
        advisors: [
          configured(
            new ScriptedAdvisor(RECORD, [new AdvisorFaulted('unreachable', 'nobody home')]),
          ),
        ],
      },
      /advisor record \(record=http:\/\/advisor\.test\) gave no advice: advisor unreachable: nobody home/,
    );
    await refused(
      {
        script,
        mission: MISSION,
        advisors: [configured(new ScriptedAdvisor(RECORD, [ACME]))],
        subjectDeclared: false,
      },
      /the session has no subject of its own: give one by name/,
    );
    await refused(
      { script, mission: `${MISSION_WITH_IDENTITY}\n${ADVISORS_HEADING}\n\n- Record\n` },
      /a line under ## Advisors is not an advisor/,
    );
    await refused(
      { script, mission: `${MISSION}\n## Taking a unit on record\n\n- forbid: never.\n` },
      /a line under ## Taking a unit on record is not an exception/,
    );
    await refused(
      { script, mission: `${MISSION_WITH_IDENTITY}\n${CONTEXT_HEADING}\n\n- landmark: sidebar\n` },
      /a line under ## Unit context is not a landmark/,
    );
    // A described advisor the mission does not name is never asked.
    const unnamed = new ScriptedAdvisor({ id: 'other', facets: ['company'] }, [ACME]);
    await refused(
      { script, mission: MISSION, advisors: [configured(unnamed, 'other')] },
      /no configured advisor answers to it$/,
    );
    expect(unnamed.described).toBe(0);
  });

  it('[BRW-14] describes a bare entry at boot to learn who it is, a named one only when the mission names it, and asks the one it resolved once before the session has a row and once before every plan', async () => {
    const bare = new ScriptedAdvisor(RECORD, [ACME]);
    const other = new ScriptedAdvisor({ id: 'other', facets: ['company'] }, [ACME]);
    const { outcome, brain } = await run({
      script: { plans: [decidedPlan(PLANS.end)] },
      mission: MISSION,
      advisors: [configured(bare, null), configured(other, 'other')],
    });
    expect([bare.described, other.described, other.requests]).toEqual([1, 0, []]);
    expect(bare.requests.map((asked) => [asked.request.asker.label, asked.probe])).toEqual([
      ['before the first step', false],
      ['step 1', false],
    ]);
    expect(bare.requests[0]?.request).toEqual({
      subject: SPEC_SUBJECT,
      asker: { kind: 'browser-session', id: outcome.sessionId, label: 'before the first step' },
      facets: ['company'],
    });
    expect(brain.planInputs[0]?.onRecord).toEqual({ units: ACME.units, omitted: 0 });
  });

  it('[BRW-14] composes every plan with what the advisor said and records it in the step file and the plan row; a mission naming none asks nothing and writes no advice file', async () => {
    const advisor = new ScriptedAdvisor(RECORD, [ACME]);
    const asked = await run({
      script: { plans: JOURNEY, answers: [decidedAnswers(ANSWERS)] },
      lines: ['Yes'],
      mission: MISSION,
      advisors: [configured(advisor)],
    });
    expect(asked.outcome.status).toBe('complete');
    expect(advisor.requests).toHaveLength(6);
    expect(asked.brain.planInputs.map((input) => input.onRecord)).toEqual(
      Array.from({ length: 5 }, () => ({ units: ACME.units, omitted: 0 })),
    );
    expect(JSON.parse(asked.dumps.text('01-steps/03/advice.json'))).toEqual({
      outcome: 'answered',
      advisors: [
        {
          advisor: 'record',
          outcome: 'answered',
          units: 1,
          omitted: 0,
          durationMs: expect.any(Number),
          adviceFromStep: 3,
          fault: null,
        },
      ],
      onRecord: { units: ACME.units, omitted: 0 },
    });
    const plan = asked.detail.decisions.find((d) => d.kind === 'step-plan' && d.step === 3);
    expect(plan?.payload['advice']).toEqual({
      outcome: 'answered',
      advisors: [
        { advisor: 'record', outcome: 'answered', units: 1, omitted: 0, adviceFromStep: 3 },
      ],
    });

    const alone = await run({ script: { plans: [decidedPlan(PLANS.end)] } });
    expect(alone.brain.planInputs[0]?.onRecord).toEqual(NO_UNITS_ON_RECORD);
    expect([...alone.dumps.files.keys()].some((path) => path.endsWith('advice.json'))).toBe(false);
    const plain = alone.detail.decisions.find((d) => d.kind === 'step-plan');
    expect(plain?.payload['advice']).toEqual({ outcome: 'no-advisors', advisors: [] });
  });

  it('[BRW-14] rides a faulting advisor on its last good advice, says so once, probes once a step, and says once when it answers again — the forbidden units it then names reaching the goal input', async () => {
    const down = new AdvisorFaulted('unreachable', 'nobody home');
    const advisor = new ScriptedAdvisor(RECORD, [ACME, ACME, down, down, GLOBEX_FORBIDDEN]);
    const { brain, dumps, warnings, logs } = await run({
      script: { plans: JOURNEY, answers: [decidedAnswers(ANSWERS)] },
      lines: ['Yes'],
      mission: MISSION,
      advisors: [configured(advisor)],
    });
    expect(advisor.requests.map((asked) => asked.probe)).toEqual([
      false,
      false,
      false,
      true,
      true,
      false,
    ]);
    const onRecord = brain.planInputs.map((input) => input.onRecord);
    expect(onRecord.slice(0, 3)).toEqual([
      { units: ACME.units, omitted: 0 },
      { units: ACME.units, omitted: 0 },
      { units: ACME.units, omitted: 0 },
    ]);
    expect(onRecord[3]).toEqual({ units: GLOBEX_FORBIDDEN.units, omitted: 3 });
    expect(onRecord[3]?.units[0]?.stance).toBe('forbid');
    expect(warnings.filter((w) => w.includes('advisor record'))).toEqual([
      'step 2: advisor record unreachable — planning on its advice from step 1 until it answers again: nobody home',
    ]);
    expect(logs.filter((line) => line.includes('advisor record'))).toEqual([
      'step 4: advisor record answers again',
    ]);
    expect(JSON.parse(dumps.text('01-steps/03/advice.json'))).toMatchObject({
      outcome: 'stale',
      advisors: [
        {
          outcome: 'stale',
          adviceFromStep: 1,
          units: 1,
          fault: { reason: 'unreachable', detail: 'nobody home' },
        },
      ],
    });
  });

  it('[BRW-14] merges what several advisors say, in the order the mission names them, and counts the omitted together', async () => {
    const record = new ScriptedAdvisor(RECORD, [ACME]);
    const other = new ScriptedAdvisor({ id: 'other', facets: ['company'] }, [
      advice(
        'other',
        [{ name: 'company', value: 'Initech', stance: 'avoid', note: 'applied 2026-09-30' }],
        2,
      ),
    ]);
    const { brain } = await run({
      script: { plans: [decidedPlan(PLANS.end)] },
      mission: naming('other', 'record'),
      advisors: [configured(record), configured(other, 'other')],
    });
    expect(brain.planInputs[0]?.onRecord).toEqual({
      units: [
        {
          identity: [{ name: 'company', value: 'Initech' }],
          stance: 'avoid',
          note: 'applied 2026-09-30',
        },
        ...ACME.units,
      ],
      omitted: 2,
    });
  });
});
