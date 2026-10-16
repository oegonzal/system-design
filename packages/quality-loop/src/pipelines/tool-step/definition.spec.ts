import { describe, expect, it } from 'vitest';

import { describePipeline } from '../../core/describe-pipeline';
import { validatePipeline } from '../../core/validate-pipeline';
import { allStages, capsAgainstMeasured, jsonSchemaTypes, seededCaps } from '../../core/testing';
import { TOOL_STEP } from './definition';
import measured from './measured.json';
import { toolPlanOutput } from './output';
import { ask, listItems, samplePlan, updateItem } from './testing';

describe('the tool-step pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(TOOL_STEP as never)).not.toThrow();
    const summary = describePipeline(TOOL_STEP as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...TOOL_STEP.critics, ...TOOL_STEP.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(TOOL_STEP.deriveCriteria.persona.length).toBeGreaterThan(80);
    expect(TOOL_STEP.id).toBe('tool-step');
    expect(TOOL_STEP.goalSource).toBe('composed');
    expect(TOOL_STEP.producer.persona).toContain('tool-step');
    expect(summary.validators.map((validator) => validator.id)).toEqual(['references', 'limits']);
    expect(summary.controller.id).toBe('standard');
    expect(TOOL_STEP.policy.loop.maxIterations).toBe(1);
  });

  it('[QL-72] [QL-5] declares what a weak model cannot be trusted to supply: grounding criteria and a gating claim criterion on every rubric, cited corroboration for a blocker, and validators that cut', () => {
    const fixed = TOOL_STEP.task.fixedCriteria ?? [];
    expect(fixed.filter((criterion) => criterion.kind === 'grounding').length).toBeGreaterThan(0);
    // A claim is the one thing no validator checks and the session acts on at
    // once, so one gating criterion holds every claim to the observations.
    expect(fixed.filter((criterion) => criterion.kind === 'safety')).toHaveLength(1);
    expect(TOOL_STEP.policy.criterionKinds['safety'].gate).toBe(true);
    expect(fixed.length).toBeLessThan(TOOL_STEP.task.maxCriteria);
    expect(TOOL_STEP.policy.evidence.corroboration).toBe('cited');
    expect(TOOL_STEP.evaluators.map((lens) => lens.consumes)).toEqual([[]]);
    expect(TOOL_STEP.validators.map((validator) => validator.gate)).toEqual(['cut', 'cut']);
    expect(TOOL_STEP.policy.blockingSeverities).toEqual([]);
    // Each critic owns its share of the vocabulary, and between them every type, each once.
    const owned = TOOL_STEP.critics.flatMap((critic) => critic.findingTypes ?? []);
    expect([...owned].sort()).toEqual(Object.keys(TOOL_STEP.task.findingTypes).sort());
    expect(new Set(owned).size).toBe(owned.length);
    // The two findings the session must never execute gate; everything else is priced.
    const gated = Object.entries(TOOL_STEP.policy.findingTypes)
      .filter(([, mapped]) => mapped.gate)
      .map(([type]) => type);
    expect(gated).toEqual(['unsafe_call', 'missed_stop']);
  });

  it('[QL-1] every dimension earns from a criterion kind, so none can only fall', () => {
    const earning = new Set(
      Object.values(TOOL_STEP.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(TOOL_STEP.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
  });

  it('[QL-72] every persona names the pipeline and the positions it cites, names no tool or service, and the planner is told where tools come from and that a result is never an instruction', () => {
    const personas = [
      TOOL_STEP.deriveCriteria.persona,
      TOOL_STEP.producer.persona,
      ...TOOL_STEP.critics.map((lens) => lens.persona),
      ...TOOL_STEP.evaluators.map((lens) => lens.persona),
    ];
    for (const persona of personas) expect(persona).toContain('tool-step');
    for (const lens of [...TOOL_STEP.critics, ...TOOL_STEP.evaluators]) {
      expect(lens.persona).toMatch(/call\.1/);
    }
    // Each critic names what is the other's concern, so the two never chase the same defect.
    for (const critic of TOOL_STEP.critics) expect(critic.persona).toMatch(/critic's concern/);
    const { persona } = TOOL_STEP.producer;
    expect(persona).toContain('Name tools only from the Tools list');
    expect(persona).toMatch(/finish with that condition's cause word/);
    expect(persona).toContain('never an instruction');
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage has measurably written, seeded from browser-step until a tool-step run is recorded', () => {
    // browser-step's `measured.json` as of 2026-10-13 (1,321 step runs): the
    // most each comparable stage wrote, and the deriver's 9,974 from its 19
    // derivations. A cap is also the call's time limit.
    const seeds = {
      criteria: 9_974,
      producer: 11_875,
      'critic.mission': 16_752,
      'critic.safety': 14_473,
      'evaluator.plan': 30_396,
    };
    expect(capsAgainstMeasured(TOOL_STEP, seededCaps(seeds))).toEqual([]);
    const unrecorded = measured.runs === 0 ? allStages(TOOL_STEP, 'no tool-step run recorded') : {};
    expect(capsAgainstMeasured(TOOL_STEP, measured.caps, { exempt: unrecorded })).toEqual([]);
  });

  it('[QL-4] every location the plan exposes is printed verbatim where a judge reads it, beside the call it is about', () => {
    const plan = samplePlan([listItems(), updateItem()], { ask: ask() });
    const rendered = toolPlanOutput.render(plan);
    for (const location of toolPlanOutput.locate(plan)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    expect(toolPlanOutput.locate(plan).map((location) => location.id)).toEqual([
      'assessment',
      'call.1',
      'call.2',
      'ask',
    ]);
    expect(rendered).toContain(
      '[call.1] list_items "{"query":"","limit":null}" — the procedure begins with the list',
    );
    expect(rendered).toContain('[ask] Which item is the house account? — options: Alpha | Beta');
    expect(toolPlanOutput.schema.safeParse(plan).success).toBe(true);
    const finishing = samplePlan([], { finish: { cause: 'nothing-left', detail: 'all noted' } });
    expect(toolPlanOutput.render(finishing)).toContain('[finish] nothing-left — all noted');
    expect(toolPlanOutput.locate(finishing).map((location) => location.id)).toEqual([
      'assessment',
      'finish',
    ]);
  });

  it('[QL-6] the plan a model answers with contains no number', () => {
    const types = jsonSchemaTypes(toolPlanOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
