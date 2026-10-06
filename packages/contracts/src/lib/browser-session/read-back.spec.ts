import { describe, expect, it } from 'vitest';

import type { IterationTrace } from '../quality-loop/decision';
import type { ConfirmedFinding, ValidationReport } from '../quality-loop/evidence';
import type { QualityRunDto } from '../quality-loop/runs';
import type { Decision } from '../quality-loop/vocab';
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
      criteria: [],
      findings,
      discarded: [],
      diagnostics: [],
    },
    decision: {
      finalDecision,
      gates: {
        artifactPresent: true,
        validatorsPassed: true,
        evidenceSufficient: true,
        policyAllowed: shape.policyAllowed ?? true,
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
      contract: { goal: 'g', criteria: [] },
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
  pageKind: 'listing',
  assessment: 'A listing page; open the first result.',
  actions: [
    { kind: 'click', ref: 'e3', reason: 'open the first listing', expect: 'the detail page' },
    { kind: 'waitFor', until: 'text', value: 'Apply', reason: 'the detail loads', expect: null },
    { kind: 'click', ref: 'e9', reason: 'press apply', expect: 'the form' },
    { kind: 'done', reason: 'the page will change', expect: null },
  ],
};

describe('routePlan', () => {
  it('[QL-36] executes an accepted plan whose policy gate is open, in full when nobody objected', () => {
    const readout = routePlan(run({ artifact: plan }), 1);
    expect(readout.executable).toBe(true);
    expect(readout.executePrefix).toBe(4);
    expect(readout.objections).toEqual([]);
  });

  it('[QL-36] hands back any plan the loop did not accept, naming the findings for the next goal', () => {
    const readout = routePlan(
      run({
        artifact: plan,
        finalDecision: 'escalate',
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

  it('[QL-36] runs only the unfaulted prefix of a plan a validator pointed into', () => {
    const readout = routePlan(
      run({
        artifact: plan,
        validation: [
          {
            validatorId: 'bounds',
            gate: 'warn',
            problems: [{ severity: 'high', message: 'e9 is Back', locationRefs: ['action.3'] }],
          },
        ],
      }),
      3,
    );
    expect(readout.executable).toBe(true);
    expect(readout.executePrefix).toBe(2);
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
    // Said, and carried to the next plan, rather than silently dropped.
    expect(readout.objections.map((o) => o.from)).toEqual(['skipped_step']);
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

  it('[QL-36] refuses a plan whose first action was faulted, a closed policy gate, or an artifact-wide finding', () => {
    expect(
      routePlan(
        run({
          artifact: plan,
          policyAllowed: false,
          findings: [{ type: 'x', locationRefs: ['action.1'] }],
        }),
        1,
      ).executable,
    ).toBe(false);
    expect(routePlan(run({ artifact: plan, policyAllowed: false }), 1).executable).toBe(false);
    expect(
      routePlan(run({ artifact: plan, findings: [{ type: 'unsafe_action', locationRefs: [] }] }), 1)
        .executable,
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

  it('[QL-37] asks for every visible field when the page was not admitted, and for a required field left blank', () => {
    const escalated = routeFields(run({ artifact: answers() }), 'fell-short', fields());
    expect(escalated.map((r) => r.route)).toEqual([
      'ask-operator',
      'ask-operator',
      'leave-blank',
      'ask-operator',
    ]);
    expect(escalated[0].reason).toBe('page-escalated: fell-short');

    const blankRequired = routeFields(
      run({ artifact: answers({ e1: { decision: 'leave-blank', value: null } }) }),
      'admitted',
      fields(),
    );
    expect(blankRequired[0].route).toBe('ask-operator');
    expect(blankRequired[0].reason).toContain('required field left blank');
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
