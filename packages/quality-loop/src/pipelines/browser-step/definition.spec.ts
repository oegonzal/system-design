import { ON_RECORD_TAKEN } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline } from '../../core/describe-pipeline';
import { validatePipeline } from '../../core/validate-pipeline';
import { capsAgainstMeasured, jsonSchemaTypes } from '../../core/testing';
import { BROWSER_STEP } from './definition';
import measured from './measured.json';
import { stepPlanOutput } from './output';
import { askFields, click, samplePlan, taskStart } from './testing';

describe('the browser-step pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(BROWSER_STEP as never)).not.toThrow();
    const summary = describePipeline(BROWSER_STEP as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...BROWSER_STEP.critics, ...BROWSER_STEP.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(BROWSER_STEP.deriveCriteria.persona.length).toBeGreaterThan(80);
    expect(BROWSER_STEP.id).toBe('browser-step');
    expect(BROWSER_STEP.goalSource).toBe('composed');
    expect(BROWSER_STEP.producer.persona).toContain('browser-step');
    expect(summary.validators.map((validator) => validator.id)).toEqual(['references', 'limits']);
    expect(summary.controller.id).toBe('standard');
    expect(BROWSER_STEP.policy.loop.maxIterations).toBe(1);
  });

  it('[QL-36] [QL-5] declares what a weak model cannot be trusted to supply: grounding criteria and a gating claim criterion on every rubric, cited corroboration for a blocker, and validators that cut', () => {
    // Grounding is the one dimension only declared criteria earn: a mission's
    // own lines fill the deriver's cap, and in 165 derived rubrics the kind
    // never once appeared.
    const fixed = BROWSER_STEP.task.fixedCriteria ?? [];
    expect(fixed.filter((criterion) => criterion.kind === 'grounding').length).toBeGreaterThan(0);
    // A claim is the one thing no validator checks and the session acts on at
    // once, so one gating criterion holds every claim to the page.
    expect(fixed.filter((criterion) => criterion.kind === 'safety')).toHaveLength(1);
    expect(BROWSER_STEP.policy.criterionKinds['safety'].gate).toBe(true);
    expect(fixed.length).toBeLessThan(BROWSER_STEP.task.maxCriteria);
    // One sample of one critic is one opinion: a blocker that cites criteria is
    // held to them, and blocks only when the evaluator failed one it cites.
    expect(BROWSER_STEP.policy.evidence.corroboration).toBe('cited');
    // Every lens judges the plan apart: the evaluator is the second reading a
    // veto needs, so it is never shown what the critics found.
    expect(BROWSER_STEP.evaluators.map((lens) => lens.consumes)).toEqual([[]]);
    // A fault at action.N refuses action.N and after; the lenses still judge.
    expect(BROWSER_STEP.validators.map((validator) => validator.gate)).toEqual(['cut', 'cut']);
    // Only the declared type gates veto; a severity word is the critic's to choose.
    expect(BROWSER_STEP.policy.blockingSeverities).toEqual([]);
    // Each critic owns its half of the vocabulary, and between them every type.
    const owned = BROWSER_STEP.critics.flatMap((critic) => critic.findingTypes ?? []);
    expect([...owned].sort()).toEqual(Object.keys(BROWSER_STEP.task.findingTypes).sort());
    expect(new Set(owned).size).toBe(owned.length);
  });

  it('[QL-1] every dimension earns from a criterion kind, so none can only fall', () => {
    const earning = new Set(
      Object.values(BROWSER_STEP.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(BROWSER_STEP.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
  });

  it('[QL-36] every persona names the pipeline and the positions it cites, and the planner is told where refs come from', () => {
    const personas = [
      BROWSER_STEP.deriveCriteria.persona,
      BROWSER_STEP.producer.persona,
      ...BROWSER_STEP.critics.map((lens) => lens.persona),
      ...BROWSER_STEP.evaluators.map((lens) => lens.persona),
    ];
    for (const persona of personas) expect(persona).toContain('browser-step');
    for (const lens of [...BROWSER_STEP.critics, ...BROWSER_STEP.evaluators]) {
      expect(lens.persona).toMatch(/action\.1/);
    }
    // Each critic names what is the other's concern, so the two never chase the same defect.
    for (const critic of BROWSER_STEP.critics) expect(critic.persona).toMatch(/critic's concern/);
    const { persona } = BROWSER_STEP.producer;
    expect(persona).toContain('Cite refs only from the Elements list');
    expect(persona).toContain('askFields');
    expect(persona).toMatch(/terminate with that condition's cause word/);
    // The three findings the session must never execute gate; everything else is priced.
    const gated = Object.entries(BROWSER_STEP.policy.findingTypes)
      .filter(([, mapped]) => mapped.gate)
      .map(([type]) => type);
    expect(gated).toEqual(['unsafe_action', 'trap_interaction', 'missed_stop']);
    expect(BROWSER_STEP.policy.criterionKinds['safety'].gate).toBe(true);
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage has measurably written', () => {
    // `measured.json` (`pnpm measure:bounds`, 1,120 runs as of 2026-10-11) is
    // what each stage measurably wrote. A cap is also the call's time limit,
    // so one a stage outwrites is a call cut short. The deriver runs once per
    // session through the criteria endpoint, outside any run, so no run
    // measures it.
    expect(measured.runs).toBeGreaterThan(0);
    expect(
      capsAgainstMeasured(BROWSER_STEP, measured.caps, {
        exempt: {
          criteria: 'derived once per session through the criteria endpoint, outside any run',
        },
      }),
    ).toEqual([]);
  });

  it('[QL-4] every location the plan exposes is printed verbatim where a judge reads it, beside the ref it acts on', () => {
    const plan = samplePlan([
      taskStart(),
      click('e3', 'open the first listing', 'the listing detail'),
      askFields(['e1', 'e2']),
    ]);
    const rendered = stepPlanOutput.render(plan);
    for (const location of stepPlanOutput.locate(plan)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    expect(stepPlanOutput.locate(plan).map((location) => location.id)).toEqual([
      'assessment',
      'action.1',
      'action.2',
      'action.3',
    ]);
    expect(rendered).toContain(
      '[action.2] click e3 — open the first listing — expect: the listing detail',
    );
    expect(rendered).toContain('[action.3] askFields e1, e2 — questions about the subject');
    expect(stepPlanOutput.schema.safeParse(plan).success).toBe(true);
    // A unit's identity and the declaration that takes it on record are what the engines check: the judges read both.
    const declared = samplePlan([taskStart('x', [{ name: 'company', value: 'Acme' }], true)]);
    expect(stepPlanOutput.render(declared)).toContain(
      '[action.1] taskStart "x" at https://jobs.example.test/apply/42 · company="Acme" · onRecordTaken',
    );
    expect(stepPlanOutput.render(plan)).not.toContain(ON_RECORD_TAKEN);
  });

  it('[QL-6] the plan a model answers with contains no number', () => {
    const types = jsonSchemaTypes(stepPlanOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
