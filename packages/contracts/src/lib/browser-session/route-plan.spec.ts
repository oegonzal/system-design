import { describe, expect, it } from 'vitest';

import { type ValidationReport } from '../quality-loop/evidence';
import { routePlan } from './read-back';
import { judgedRun } from './read-back.testing';
import { ASSESSMENT_BOUND, type StepPlan } from './step-plan.schema';

const plan: StepPlan = {
  assessment: 'A listing page; open the first result.',
  actions: [
    {
      kind: 'click',
      ref: 'e3',
      reason: 'open the first listing',
      expect: 'the detail page',
      serves: [],
    },
    {
      kind: 'waitFor',
      until: 'text',
      value: 'Apply',
      reason: 'the detail loads',
      expect: null,
      serves: [],
    },
    { kind: 'click', ref: 'e9', reason: 'press apply', expect: 'the form', serves: [] },
    { kind: 'done', reason: 'the page will change', expect: null, serves: [] },
  ],
};

describe('routePlan', () => {
  it('[QL-36] executes an accepted plan whose policy gate is open, in full when nobody objected, and says what the evaluator passed', () => {
    const readout = routePlan(
      judgedRun({
        artifact: plan,
        criteria: [
          { criterionId: 'c1', result: 'pass' },
          { criterionId: 'c2', result: 'not_applicable' },
          { criterionId: 'c3', kind: 'safety', result: 'pass' },
        ],
      }),
      1,
    );
    expect(readout.executable).toBe(true);
    expect(readout.executePrefix).toBe(4);
    expect(readout.objections).toEqual([]);
    // Every criterion settled pass, whatever its kind: which may be settled is the session's to decide.
    expect(readout.passed).toEqual(['c1', 'c3']);
    expect(routePlan(judgedRun({ artifact: plan }), 1).passed).toEqual([]);
  });

  it('[QL-36] hands back any plan the loop did not accept, naming the findings for the next goal', () => {
    const readout = routePlan(
      judgedRun({
        artifact: plan,
        finalDecision: 'escalate',
        policyAllowed: false,
        findings: [
          { type: 'missed_stop', locationRefs: [], rationale: 'the limit text is visible' },
        ],
      }),
      7,
    );
    expect(readout.executable).toBe(false);
    expect(readout.reason).toContain('decided escalate');
    // Whole, and stamped with the step it came from: the next goal carries it
    // as one objection, not as a note copied onto each action it was about.
    expect(readout.objections).toEqual([
      { step: 7, from: 'missed_stop', at: [], detail: 'the limit text is visible' },
    ]);
  });

  it('[QL-36] a plan nothing cut is held to the loop’s verdict, while a plan cut at a position runs up to it whatever the score', () => {
    // Declared policy, pinned: measured 2026-10-07, eleven of twenty-two plans
    // ended in a claim the validators cut, and so would run their prefix at
    // any score, while the one plan nothing cut was refused on its score.
    const claimCut: ValidationReport = {
      validatorId: 'limits',
      gate: 'cut',
      problems: [
        {
          severity: 'high',
          message: 'done follows the click at action.3: it claims what the page shows',
          locationRefs: ['action.4'],
        },
      ],
    };
    const belowTheBar = routePlan(
      judgedRun({ artifact: plan, finalDecision: 'escalate', validation: [claimCut] }),
      1,
    );
    expect(belowTheBar).toMatchObject({ executable: true, executePrefix: 3, reason: null });
    const uncutBelowTheBar = routePlan(judgedRun({ artifact: plan, finalDecision: 'escalate' }), 1);
    expect(uncutBelowTheBar.executable).toBe(false);
    expect(uncutBelowTheBar.reason).toContain('decided escalate');
  });

  it('[QL-36] runs a handed-back plan up to the first action a cutting validator pointed at, carrying the cut as the objection', () => {
    // Measured on 2026-10-07: six plans in a row were refused whole for a ref
    // at action.2 or action.3 while action.1 — a navigate that would have
    // taken the session off an empty document — was never faulted. The loop
    // still hands such a plan back; the session runs what nobody objected to.
    const readout = routePlan(
      judgedRun({
        artifact: plan,
        finalDecision: 'escalate',
        validation: [
          {
            validatorId: 'references',
            gate: 'cut',
            problems: [
              {
                severity: 'critical',
                message: 'e9 is not a listed element',
                locationRefs: ['action.3'],
              },
            ],
          },
        ],
      }),
      3,
    );
    expect(readout.executable).toBe(true);
    expect(readout.executePrefix).toBe(2);
    expect(readout.objections).toEqual([
      { step: 3, from: 'references', at: ['action.3'], detail: 'e9 is not a listed element' },
    ]);
  });

  it('[QL-36] a handed-back plan with a blocking finding at an action runs up to it; one at the assessment runs not at all', () => {
    const atAction = routePlan(
      judgedRun({
        artifact: plan,
        finalDecision: 'escalate',
        policyAllowed: false,
        findings: [{ type: 'unsafe_action', severity: 'critical', locationRefs: ['action.3'] }],
      }),
      5,
    );
    expect(atAction.executable).toBe(true);
    expect(atAction.executePrefix).toBe(2);
    expect(atAction.objections.map((o) => o.from)).toEqual(['unsafe_action']);

    // An objection to the plan's reading of the page: nothing planned on a
    // misread page is trusted, however far from action.1 the words sit.
    const atAssessment = routePlan(
      judgedRun({
        artifact: plan,
        finalDecision: 'escalate',
        policyAllowed: false,
        findings: [{ type: 'missed_stop', severity: 'critical', locationRefs: ['assessment'] }],
      }),
      5,
    );
    expect(atAssessment.executable).toBe(false);
    expect(atAssessment.reason).toContain('as a whole');
  });

  it('[QL-36] what did not block is advice, carried on the run and never as an objection to answer', () => {
    // Measured on 2026-10-07: one critic's uncorroborated finding about a stop
    // the page could not show, carried as an objection, was read by the next
    // producer as a fact about the page; twelve plans later the session was
    // terminating for it.
    const readout = routePlan(
      judgedRun({
        artifact: plan,
        finalDecision: 'escalate',
        policyAllowed: true,
        findings: [
          {
            type: 'missed_stop',
            severity: 'critical',
            locationRefs: ['assessment'],
            rationale: 'might',
          },
        ],
      }),
      1,
    );
    // Nothing blocked and the loop did not accept: the plan does not run on
    // quality alone — and the next plan is not told to answer the advice.
    expect(readout.executable).toBe(false);
    expect(readout.reason).toContain('decided escalate');
    expect(readout.objections).toEqual([]);
  });

  it('[QL-36] carries every criterion the evaluator settled short, with its statement, so a plan handed back on its score is told why', () => {
    const readout = routePlan(
      judgedRun({
        artifact: plan,
        finalDecision: 'escalate',
        criteria: [
          { criterionId: 'c1', result: 'fail', locationRefs: ['action.1'] },
          { criterionId: 'c2', result: 'pass', locationRefs: ['assessment'] },
          { criterionId: 'c3', result: 'partial', locationRefs: [] },
        ],
        contract: [
          { id: 'c1', kind: 'progress', statement: 'Open the next listing.' },
          { id: 'c2', kind: 'safety', statement: 'Never sign in.' },
          { id: 'c3', kind: 'grounding', statement: 'Name the kind of page shown.' },
        ],
      }),
      2,
    );
    expect(readout.objections).toEqual([
      { step: 2, from: 'c1', at: ['action.1'], detail: 'fail: Open the next listing.' },
      { step: 2, from: 'c3', at: [], detail: 'partial: Name the kind of page shown.' },
    ]);
  });

  it('[QL-36] runs a plan the decision accepted in full, however much advice the judges left on it', () => {
    // Measured on 2026-10-06: a plan every gate passed — `policyAllowed` true,
    // overall 73.3 against a threshold of 70 — never ran, because one `low`
    // finding of a type the pipeline declares `gate: false` pointed at
    // `action.1`. Ten steps of a session went that way and the page never
    // moved. What a judge said is carried as an objection; it is not a veto
    // the controller did not reach.
    const advised = judgedRun({
      artifact: plan,
      findings: [
        { type: 'skipped_step', severity: 'low', locationRefs: ['action.1'], rationale: 'thin' },
      ],
    });
    const readout = routePlan(advised, 4);
    expect(readout.executable).toBe(true);
    expect(readout.executePrefix).toBe(plan.actions.length);
    // Advice stays on the run's record for a reader; it is not an objection
    // the next plan has to answer, since nothing refused anything.
    expect(readout.objections).toEqual([]);
  });

  it("[QL-36] carries a validator's own problem as an objection, so a plan refused by a validator is told which limit and why", () => {
    // The live defect: a plan blocked by the `limits` validator reached the next
    // producer as "blocked by validator(s) limits" and nothing more — never the
    // message that said which element could not be typed into.
    const readout = routePlan(
      judgedRun({
        artifact: plan,
        finalDecision: 'escalate',
        validation: [
          {
            validatorId: 'limits',
            gate: 'block',
            problems: [
              {
                severity: 'high',
                message: 'e32 cannot be typed into (selectable)',
                locationRefs: ['action.2'],
              },
            ],
          },
          {
            // A validator that only warns refused nothing: its problems say so
            // in their own text, and are not the next plan's to answer.
            validatorId: 'bounds',
            gate: 'warn',
            problems: [
              {
                severity: 'low',
                message: 'assessment: 719 characters; 700 asked, 875 accepted — noted, not refused',
                locationRefs: [],
              },
            ],
          },
        ],
      }),
      4,
    );
    expect(readout.executable).toBe(false);
    expect(readout.objections).toEqual([
      {
        step: 4,
        from: 'limits',
        at: ['action.2'],
        detail: 'e32 cannot be typed into (selectable)',
      },
    ]);
  });

  it('[QL-36] refuses a plan whose first action was faulted, one handed back with nothing to cut at, or an artifact-wide blocker', () => {
    expect(
      routePlan(
        judgedRun({
          artifact: plan,
          finalDecision: 'escalate',
          policyAllowed: false,
          findings: [{ type: 'x', locationRefs: ['action.1'] }],
        }),
        1,
      ).executable,
    ).toBe(false);
    expect(
      routePlan(judgedRun({ artifact: plan, finalDecision: 'escalate', policyAllowed: false }), 1)
        .executable,
    ).toBe(false);
    expect(
      routePlan(
        judgedRun({
          artifact: plan,
          finalDecision: 'escalate',
          policyAllowed: false,
          findings: [{ type: 'unsafe_action', locationRefs: [] }],
        }),
        1,
      ).executable,
    ).toBe(false);
    expect(routePlan(judgedRun({ artifact: null }), 1).reason).toBe('no-artifact');
    expect(routePlan(judgedRun({ artifact: { not: 'a plan' } }), 1).reason).toContain('schema');
  });

  it('[QL-36] [QL-58] executes a plan whose assessment the seam kept past its ceiling, read as it was kept', () => {
    const assessment = 'a'.repeat(ASSESSMENT_BOUND.ceiling + 1);
    const readout = routePlan(judgedRun({ artifact: { ...plan, assessment } }), 1);
    expect(readout.executable).toBe(true);
    expect(readout.executePrefix).toBe(4);
    expect(readout.plan?.assessment).toBe(assessment);
  });
});
