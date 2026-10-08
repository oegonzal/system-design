import { describe, expect, it } from 'vitest';

import type { IterationTrace } from '../quality-loop/decision';
import type {
  ConfirmedFinding,
  CriterionEvidence,
  SuccessCriterion,
  ValidationReport,
} from '../quality-loop/evidence';
import type { QualityRunDto } from '../quality-loop/runs';
import { REFUSING_GATES, type Decision } from '../quality-loop/vocab';
import { ANSWER_REASON_BOUND, type FieldAnswers } from './field-answers.schema';
import { fieldSpecOf } from './field-goal';
import { formObservation } from './fixtures';
import { routeFields, routePlan } from './read-back';
import { ASSESSMENT_BOUND, type StepPlan } from './step-plan.schema';

interface RunShape {
  artifact: unknown;
  finalDecision?: Decision;
  policyAllowed?: boolean;
  findings?: Partial<ConfirmedFinding>[];
  validation?: ValidationReport[];
  criteria?: Partial<CriterionEvidence>[];
  contract?: SuccessCriterion[];
}

/** A finished run with one iteration, judged as described; every other field is the quiet default. */
function run(shape: RunShape): QualityRunDto {
  const finalDecision = shape.finalDecision ?? 'accept';
  const findings: ConfirmedFinding[] = (shape.findings ?? []).map((f, i) => ({
    key: f.key ?? `${f.type ?? 'defect'}|${(f.locationRefs ?? []).join(',')}`,
    type: f.type ?? 'defect',
    severity: f.severity ?? 'medium',
    confidence: f.confidence ?? 'high',
    fixability: f.fixability ?? 'fixable_local',
    locationRefs: f.locationRefs ?? [],
    criterionIds: f.criterionIds ?? [],
    hits: 1,
    lenses: [`critic.${i}`],
    rationale: f.rationale ?? null,
    reconciledTo: null,
  }));
  const policyAllowed = shape.policyAllowed ?? true;
  const refusing = (shape.validation ?? []).filter(
    (report) =>
      (REFUSING_GATES as readonly string[]).includes(report.gate) && report.problems.length > 0,
  );
  const iteration: IterationTrace = {
    iteration: 1,
    mode: 'initial',
    artifact: shape.artifact,
    locations: [],
    rendered: 'rendered',
    validation: shape.validation ?? [],
    critics: [],
    evaluators: [],
    ledger: {
      artifactPresent: true,
      validation: shape.validation ?? [],
      criteria: (shape.criteria ?? []).map((c) => ({
        criterionId: c.criterionId ?? 'c1',
        kind: c.kind ?? 'progress',
        result: c.result ?? 'pass',
        hits: 1,
        confidence: 'high',
        locationRefs: c.locationRefs ?? [],
      })),
      findings,
      discarded: [],
      diagnostics: [],
    },
    decision: {
      finalDecision,
      gates: {
        artifactPresent: true,
        validatorsPassed: refusing.length === 0,
        evidenceSufficient: true,
        policyAllowed,
      },
      // As the engine records it: every refusing report, and every finding
      // when the policy gate is closed — never a finding when it is open.
      blocking: {
        validators: refusing.map((report) => report.validatorId),
        findings: policyAllowed ? [] : findings.map((finding) => finding.key),
        criteria: [],
      },
      scores: { dimensions: {}, overall: 80 },
      selectedRemediations: [],
      reason: `decided ${finalDecision}`,
      trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: 80 },
    },
    remediations: [],
    durationMs: 1,
  };
  return {
    runId: 'run-1',
    pipeline: 'browser-step',
    status: 'complete',
    startedAt: '2026-10-02T00:00:00.000Z',
    finishedAt: '2026-10-02T00:01:00.000Z',
    heartbeatAt: '2026-10-02T00:01:00.000Z',
    llm: { model: 'fake' },
    request: {
      goal: 'g',
      outputProvided: false,
      criteriaProvided: true,
      adoptedFrom: null,
      maxIterations: 1,
    },
    parentRunId: null,
    recall: null,
    trace: {
      pipeline: { id: 'browser-step', version: '1.0.0' },
      contract: { goal: 'g', criteria: shape.contract ?? [] },
      iterations: [iteration],
      bestIteration: 1,
      finalDecision,
      stopReason: finalDecision === 'accept' ? 'accepted' : 'escalated',
      lessons: [],
    },
    exchanges: [],
    error: null,
  };
}

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
      run({
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
    expect(routePlan(run({ artifact: plan }), 1).passed).toEqual([]);
  });

  it('[QL-36] hands back any plan the loop did not accept, naming the findings for the next goal', () => {
    const readout = routePlan(
      run({
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
      run({ artifact: plan, finalDecision: 'escalate', validation: [claimCut] }),
      1,
    );
    expect(belowTheBar).toMatchObject({ executable: true, executePrefix: 3, reason: null });
    const uncutBelowTheBar = routePlan(run({ artifact: plan, finalDecision: 'escalate' }), 1);
    expect(uncutBelowTheBar.executable).toBe(false);
    expect(uncutBelowTheBar.reason).toContain('decided escalate');
  });

  it('[QL-36] runs a handed-back plan up to the first action a cutting validator pointed at, carrying the cut as the objection', () => {
    // Measured on 2026-10-07: six plans in a row were refused whole for a ref
    // at action.2 or action.3 while action.1 — a navigate that would have
    // taken the session off an empty document — was never faulted. The loop
    // still hands such a plan back; the session runs what nobody objected to.
    const readout = routePlan(
      run({
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
      run({
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
      run({
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
      run({
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
      run({
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
    const advised = run({
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
      run({
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
        run({
          artifact: plan,
          finalDecision: 'escalate',
          policyAllowed: false,
          findings: [{ type: 'x', locationRefs: ['action.1'] }],
        }),
        1,
      ).executable,
    ).toBe(false);
    expect(
      routePlan(run({ artifact: plan, finalDecision: 'escalate', policyAllowed: false }), 1)
        .executable,
    ).toBe(false);
    expect(
      routePlan(
        run({
          artifact: plan,
          finalDecision: 'escalate',
          policyAllowed: false,
          findings: [{ type: 'unsafe_action', locationRefs: [] }],
        }),
        1,
      ).executable,
    ).toBe(false);
    expect(routePlan(run({ artifact: null }), 1).reason).toBe('no-artifact');
    expect(routePlan(run({ artifact: { not: 'a plan' } }), 1).reason).toContain('schema');
  });

  it('[QL-36] [QL-58] executes a plan whose assessment the seam kept past its ceiling, read as it was kept', () => {
    const assessment = 'a'.repeat(ASSESSMENT_BOUND.ceiling + 1);
    const readout = routePlan(run({ artifact: { ...plan, assessment } }), 1);
    expect(readout.executable).toBe(true);
    expect(readout.executePrefix).toBe(4);
    expect(readout.plan?.assessment).toBe(assessment);
  });
});

const fields = () =>
  formObservation()
    .elements.filter((e) => e.kind !== 'clickable')
    .map(fieldSpecOf);

const answers = (
  overrides: Partial<Record<string, Partial<FieldAnswers['fields'][number]>>> = {},
): FieldAnswers => ({
  summary: 'Four fields; evidence covers the first.',
  fields: [
    {
      ref: 'e1',
      decision: 'answer',
      value: '6',
      confidence: 'high',
      basis: ['m1'],
      reason: 'from m1',
    },
    {
      ref: 'e2',
      decision: 'answer',
      value: 'Yes',
      confidence: 'medium',
      basis: [],
      reason: 'likely',
    },
    {
      ref: 'e3',
      decision: 'answer',
      value: 'https://x',
      confidence: 'high',
      basis: [],
      reason: 'oops',
    },
    {
      ref: 'e4',
      decision: 'leave-blank',
      value: null,
      confidence: 'high',
      basis: [],
      reason: 'bait',
    },
  ].map((answer) => ({ ...answer, ...(overrides[answer.ref] ?? {}) })) as FieldAnswers['fields'],
});

describe('routeFields', () => {
  it('[QL-37] fills a grounded answer, asks for an ungrounded medium one, and blanks a hidden field whatever the model said', () => {
    const routes = routeFields(run({ artifact: answers() }), 'admitted', fields());
    expect(routes.map((r) => [r.field.ref, r.route, r.source])).toEqual([
      ['e1', 'fill', 'memory'],
      ['e2', 'ask-operator', 'loop'],
      ['e3', 'leave-blank', 'blank'],
      ['e4', 'leave-blank', 'blank'],
    ]);
    expect(routes[0].value).toBe('6');
    expect(routes[2].reason).toContain('trap-skipped');
  });

  it('[QL-37] never fills a field a confirmed finding or a validation warning points at', () => {
    const routes = routeFields(
      run({
        artifact: answers(),
        findings: [
          { type: 'ungrounded', locationRefs: ['field.1'], rationale: 'no evidence says 6' },
        ],
        validation: [
          {
            validatorId: 'limits',
            gate: 'warn',
            problems: [{ severity: 'medium', locationRefs: ['field.2'], message: 'not an option' }],
          },
        ],
      }),
      'admitted',
      fields(),
    );
    expect(routes[0].route).toBe('ask-operator');
    expect(routes[0].faults).toEqual(['ungrounded: no evidence says 6']);
    expect(routes[0].value).toBe('6');
    expect(routes[1].faults).toEqual(['limits: not an option']);
  });

  it('[QL-37] a run that fell short demotes nothing by itself; a page nothing judged asks for its required fields and blanks the optional ones; a required field left blank is asked', () => {
    const fellShort = routeFields(run({ artifact: answers() }), 'fell-short', fields());
    expect(fellShort.map((r) => r.route)).toEqual([
      'fill',
      'ask-operator',
      'leave-blank',
      'leave-blank',
    ]);
    const unjudged = routeFields(run({ artifact: answers() }), 'no-rubric', fields());
    expect(unjudged.map((r) => [r.route, r.source])).toEqual([
      ['ask-operator', 'engine'],
      ['ask-operator', 'engine'],
      ['leave-blank', 'blank'],
      ['leave-blank', 'engine'],
    ]);
    expect(unjudged[0].reason).toBe('page-escalated: no-rubric');
    expect(unjudged[3].reason).toBe('optional, left blank: page-escalated: no-rubric');

    const blankRequired = routeFields(
      run({ artifact: answers({ e1: { decision: 'leave-blank', value: null } }) }),
      'admitted',
      fields(),
    );
    expect(blankRequired[0].route).toBe('ask-operator');
    expect(blankRequired[0].reason).toContain('required field left blank');
  });

  it('[QL-37] keeps what a field holds when the model says so or answers with the same value, asks when a keep has nothing to keep, and blanks an optional field a judge faulted', () => {
    const holding = fields().map((field) =>
      field.ref === 'e1' ? { ...field, value: '6' } : field,
    );
    const kept = routeFields(
      run({ artifact: answers({ e1: { decision: 'keep', value: null } }) }),
      'admitted',
      holding,
    );
    expect(kept[0]).toMatchObject({ route: 'keep', value: '6', source: 'memory' });
    const same = routeFields(run({ artifact: answers() }), 'admitted', holding);
    expect(same[0]).toMatchObject({
      route: 'keep',
      value: '6',
      reason: 'holds it already: from m1',
    });
    const empty = routeFields(
      run({ artifact: answers({ e1: { decision: 'keep', value: null } }) }),
      'admitted',
      fields(),
    );
    expect(empty[0]).toMatchObject({ route: 'ask-operator', reason: 'nothing to keep: from m1' });
    // A judge pointed at an optional field: left blank with the fault on the row, never the operator's.
    const faulted = routeFields(
      run({
        artifact: answers({ e4: { decision: 'answer', value: 'none' } }),
        findings: [{ type: 'ungrounded', locationRefs: ['field.4'], rationale: 'invented' }],
      }),
      'admitted',
      fields(),
    );
    expect(faulted[3]).toMatchObject({
      route: 'leave-blank',
      source: 'loop',
      reason: 'optional, left blank: faulted',
      faults: ['ungrounded: invented'],
    });
  });

  it('[QL-37] asks when the model answered with low confidence or did not answer at all', () => {
    const low = routeFields(
      run({ artifact: answers({ e1: { confidence: 'low' } }) }),
      'admitted',
      fields(),
    );
    expect(low[0].route).toBe('ask-operator');
    expect(low[0].value).toBe('6');

    const partial = answers();
    partial.fields = partial.fields.filter((f) => f.ref !== 'e2');
    const missing = routeFields(run({ artifact: partial }), 'admitted', fields());
    expect(missing[1]).toMatchObject({
      route: 'ask-operator',
      reason: 'unanswered',
      source: 'engine',
    });
  });

  it('[QL-37] [QL-58] routes every answer of a page whose reason the seam kept just past its ceiling', () => {
    const reason = 'r'.repeat(ANSWER_REASON_BOUND.ceiling + 1);
    const routes = routeFields(
      run({ artifact: answers({ e1: { reason } }) }),
      'admitted',
      fields(),
    );
    expect(routes.map((r) => [r.field.ref, r.route, r.source])).toEqual([
      ['e1', 'fill', 'memory'],
      ['e2', 'ask-operator', 'loop'],
      ['e3', 'leave-blank', 'blank'],
      ['e4', 'leave-blank', 'blank'],
    ]);
    expect(routes[0]).toMatchObject({ value: '6', reason });
  });
});
