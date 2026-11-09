import {
  ADVICE_UNITS_BOUND,
  ADVISORS_HEADING,
  MISSION_WITH_IDENTITY,
  MISSION_WITH_TAKEN,
  ON_RECORD_TAKEN,
  type StepPlan,
  type UnitAdvice,
} from '@sysdesign/contracts';

import { advice, decidedAnswers, decidedPlan, ScriptedAdvisor } from './testing';
import { AdvisorFaulted } from './unit-advice';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  JOURNEY_URLS,
} from './testing-journey';
import { runScripted as run, type Scenario } from './testing-session';
import type { ConfiguredAdvisor } from './unit-advice';

/**
 * A taskStart held by the session to the record the step was composed with —
 * every unit the advisor answered, whether the goal had room to list it or
 * not. Measured 2026-10-14: a goal rendered 40 of 43 units on record, the
 * planner opened one of the three cut as "not on the list", and the session
 * began applying again where it had applied four days before.
 */
/** The mission declares the identity, the advisor, and the exception for a unit to avoid; the control it ties the exception to is the validator's to check, never the session's. */
const MISSION = `${MISSION_WITH_TAKEN}\n${ADVISORS_HEADING}\n\n- record\n`;
/** The same mission granting no exception. */
const MISSION_NO_EXCEPTION = `${MISSION_WITH_IDENTITY}\n${ADVISORS_HEADING}\n\n- record\n`;
const RECORD = { id: 'record', facets: ['company'] };
const ACME = {
  name: 'company',
  value: 'Acme',
  stance: 'avoid',
  note: 'applied 2026-10-03',
} as const;
const ON_RECORD = advice('record', [
  ACME,
  { name: 'company', value: 'Globex', stance: 'forbid', note: 'in progress in another session' },
]);
const advisors = (answer: UnitAdvice = ON_RECORD): ConfiguredAdvisor[] => [
  {
    id: 'record',
    where: 'record=http://advisor.test',
    port: new ScriptedAdvisor(RECORD, [answer]),
  },
];

const common = { reason: 'the procedure says so', expect: null, serves: [] };

/** The results page's plan: open the unit for the first card, then click it. */
const opening = (company: string, declared = false): StepPlan => ({
  assessment: 'the listing is in the pane; its unit opens and the card is clicked',
  actions: [
    {
      kind: 'taskStart',
      label: `Senior Engineer at ${company}`,
      url: JOURNEY_URLS.listing,
      facets: [{ name: 'company', value: company }],
      ...(declared ? { [ON_RECORD_TAKEN]: true } : {}),
      ...common,
    },
    { kind: 'click', ref: 'e1', ...common },
  ],
});

const REFUSED =
  'refused by the session: a unit on record to avoid is started only by a plan declaring onRecordTaken: true, under the exception the mission declares; choose another item, or declare it where the exception holds. The taskStart names company "Acme" (applied 2026-10-03).';
const NOTE = 'refused by the session: on record to avoid (applied 2026-10-03)';

const session = (plans: StepPlan[], scenario: Partial<Scenario> = {}) =>
  run({
    script: { plans: plans.map((plan) => decidedPlan(plan)), answers: [decidedAnswers(ANSWERS)] },
    lines: ['Yes'],
    mission: MISSION,
    advisors: advisors(),
    ...scenario,
  });

describe('a taskStart at a unit on record', () => {
  it('[BRW-13] to avoid is refused unless the plan declares it takes it under the mission’s exception: no unit opens, the actions after it do not run, the step counts one failure, and the next goal carries the fact in the history and the reason once as an objection, every later goal the unit refused', async () => {
    const { brain, browser, detail, logs, outcome } = await session([
      PLANS.search,
      opening('Acme'),
      opening('Acme', true),
      PLANS.form,
      PLANS.done,
      PLANS.end,
    ]);
    expect(detail.tasks.map((task) => [task.label, task.facets, task.startStep])).toEqual([
      ['Senior Engineer at Acme', [{ name: 'company', value: 'Acme' }], 3],
    ]);
    // The click after the refused taskStart was planned for a unit that never opened.
    expect(browser.calls.filter((call) => call === 'observe results')).toHaveLength(2);
    expect(browser.calls.filter((call) => call === 'click e1')).toHaveLength(1);
    expect(logs).toContain('step 2: unit-refused (1 in a row)');
    const third = brain.planInputs[2];
    expect(third?.pageUnchanged).toBe(true);
    expect(third?.lastStep).toEqual({ ran: 0, touched: [], held: ['click'] });
    expect(third?.history.at(-1)).toEqual({
      action: 'taskStart "Senior Engineer at Acme"',
      outcome: 'not-executed',
      note: NOTE,
    });
    expect(third?.objections).toEqual([
      { step: 2, from: 'session', at: ['action.1'], detail: REFUSED },
    ]);
    // The unit refused stays named in every later goal of the session, past its objection's one goal.
    const refusedAcme = [
      { facets: [{ name: 'company', value: 'Acme' }], note: 'applied 2026-10-03' },
    ];
    expect(third?.ledger.refused).toEqual(refusedAcme);
    expect(brain.planInputs.at(-1)?.ledger.refused).toEqual(refusedAcme);
    expect(brain.planInputs[1]?.ledger.refused).toEqual([]);
    // The declared plan ran whole and moved the page: nothing is carried, what it took is on the record, and the session reaches its end.
    expect(brain.planInputs[3]?.objections).toEqual([]);
    expect(brain.planInputs[3]?.history).toContainEqual({
      action: 'taskStart "Senior Engineer at Acme"',
      outcome: 'ok',
      note: 'takes a unit on record to avoid (applied 2026-10-03), as declared',
    });
    expect(outcome.status).toBe('complete');
  });

  it('[BRW-13] as forbidden is refused whatever the plan declares; one not on record opens, with a declaration it did not need noted, and so does one when the mission asks no advisor', async () => {
    const forbidden = await session([PLANS.search, opening('Globex', true), PLANS.end]);
    expect(forbidden.detail.tasks).toEqual([]);
    expect(forbidden.brain.planInputs[2]?.history.at(-1)).toEqual({
      action: 'taskStart "Senior Engineer at Globex"',
      outcome: 'not-executed',
      note: 'refused by the session: on record as forbidden (in progress in another session)',
    });
    expect(forbidden.brain.planInputs[2]?.objections.map((objection) => objection.detail)).toEqual([
      'refused by the session: a unit on record as forbidden is never started; choose another item. The taskStart names company "Globex" (in progress in another session).',
    ]);
    expect(forbidden.outcome.status).toBe('complete');

    const other = await session([
      PLANS.search,
      opening('Initech', true),
      PLANS.form,
      PLANS.done,
      PLANS.end,
    ]);
    expect(other.detail.tasks.map((task) => task.label)).toEqual(['Senior Engineer at Initech']);
    expect(other.brain.planInputs.every((input) => input.objections.length === 0)).toBe(true);
    expect(other.brain.planInputs[2]?.history).toContainEqual({
      action: 'taskStart "Senior Engineer at Initech"',
      outcome: 'ok',
      note: 'declares onRecordTaken for a unit not on record',
    });

    const alone = await session(
      [PLANS.search, opening('Acme'), PLANS.form, PLANS.done, PLANS.end],
      { mission: MISSION_WITH_IDENTITY, advisors: [] },
    );
    expect(alone.detail.tasks.map((task) => task.label)).toEqual(['Senior Engineer at Acme']);
    expect(alone.outcome.status).toBe('complete');
  });

  it('[BRW-13] a mission declaring no exception grants none, so the declaration lifts nothing; and the record is held whole — the unit past the rendered bound is refused as the first would be', async () => {
    const none = await session([PLANS.search, opening('Acme', true), PLANS.end], {
      mission: MISSION_NO_EXCEPTION,
    });
    expect(none.detail.tasks).toEqual([]);
    expect(none.brain.planInputs[2]?.history.at(-1)).toEqual({
      action: 'taskStart "Senior Engineer at Acme"',
      outcome: 'not-executed',
      note: NOTE,
    });
    expect(none.brain.planInputs[2]?.objections.map((objection) => objection.detail)).toEqual([
      'refused by the session: a unit on record to avoid is never started; choose another item. The taskStart names company "Acme" (applied 2026-10-03).',
    ]);

    // The goal names units within a byte bound and counts the rest; the session reads every one the advisor answered,
    // so a unit past the listing — Acme, last of as many as an advisor answers with — is refused all the same.
    const past = Array.from({ length: ADVICE_UNITS_BOUND.target - 1 }, (_, i) => ({
      name: 'company',
      value: `Company ${i} of a record long past the listing's bytes`,
      stance: 'avoid' as const,
    }));
    const long = await session([PLANS.search, opening('Acme'), PLANS.end], {
      advisors: advisors(advice('record', [...past, ACME])),
    });
    expect(long.brain.planInputs[1]?.onRecord.units).toHaveLength(ADVICE_UNITS_BOUND.target);
    expect(long.detail.tasks).toEqual([]);
    expect(long.logs).toContain('step 2: unit-refused (1 in a row)');
    expect(long.brain.planInputs[2]?.history.at(-1)?.note).toBe(NOTE);
  });

  it('[BRW-13] a unit the advice counted past its own bound is asked for by identity at taskStart and refused as a named one; the exception lifts it as it lifts a named one; an advisor that faults on the lookup is warned about and the unit opens; and an advice that counted nothing past its bound is never asked', async () => {
    // Measured 2026-11-09: a record of 255 companies was answered as 200 and 55 counted, and a taskStart
    // on one of the 55 was refused by nothing.
    const past = Array.from({ length: 3 }, (_, i) => ({
      name: 'company',
      value: `Company ${i}`,
      stance: 'avoid' as const,
    }));
    const acme = {
      identity: [{ name: ACME.name, value: ACME.value }],
      stance: ACME.stance,
      note: ACME.note,
    };
    const hiding = (omitted: number, fault: AdvisorFaulted | null = null) => {
      const port = new ScriptedAdvisor(RECORD, [advice('record', past, omitted)]);
      port.hidden = [acme];
      port.lookupFault = fault;
      const configured: ConfiguredAdvisor[] = [
        { id: 'record', where: 'record=http://advisor.test', port },
      ];
      return { port, configured };
    };

    const counted = hiding(1);
    const refused = await session([PLANS.search, opening('Acme'), PLANS.end], {
      advisors: counted.configured,
    });
    expect(refused.detail.tasks).toEqual([]);
    expect(refused.logs).toContain('step 2: unit-refused (1 in a row)');
    expect(refused.brain.planInputs[2]?.history.at(-1)?.note).toBe(NOTE);
    expect(refused.brain.planInputs[2]?.objections.map((objection) => objection.detail)).toEqual([
      REFUSED,
    ]);
    // Asked once, by the claim's identity, under the step's own asker, without a probe while the advisor answers.
    expect(counted.port.lookups).toEqual([
      {
        request: {
          subject: 'Alex Example',
          asker: { kind: 'browser-session', id: refused.detail.id, label: 'step 2' },
          facets: ['company'],
          identity: [{ name: 'company', value: 'Acme' }],
        },
        probe: false,
      },
    ]);

    // The plan declaring the mission's exception takes the unit the lookup found, as it takes a named one.
    const declared = hiding(1);
    const taken = await session([PLANS.search, opening('Acme', true), PLANS.end], {
      advisors: declared.configured,
    });
    expect(taken.detail.tasks.map((task) => task.label)).toEqual(['Senior Engineer at Acme']);
    expect(declared.port.lookups).toHaveLength(1);

    // An advisor that cannot answer the lookup is warned about, and the unit opens on the record composed with.
    const faulting = hiding(1, new AdvisorFaulted('unreachable', 'socket closed'));
    const opened = await session([PLANS.search, opening('Acme'), PLANS.end], {
      advisors: faulting.configured,
    });
    expect(opened.detail.tasks.map((task) => task.label)).toEqual(['Senior Engineer at Acme']);
    expect(opened.warnings).toContain(
      "step 2: advisor record unreachable when asked about a unit past its advice's bound — the unit opens on the record composed with: socket closed",
    );

    // An advice that counted nothing past its bound holds the whole record already: nothing is asked.
    const whole = hiding(0);
    const unasked = await session([PLANS.search, opening('Acme'), PLANS.end], {
      advisors: whole.configured,
    });
    expect(unasked.detail.tasks.map((task) => task.label)).toEqual(['Senior Engineer at Acme']);
    expect(whole.port.lookups).toEqual([]);
  });
});
