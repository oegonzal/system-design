import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { capsBelowMeasured, declaredCaps, jsonSchemaTypes } from '../../core/testing';
import { FIELD_ANSWER } from './definition';
import { fieldAnswersOutput } from './output';
import { sampleAnswers } from './testing';

describe('the field-answer pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(FIELD_ANSWER as never)).not.toThrow();
    const summary = describePipeline(FIELD_ANSWER as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...FIELD_ANSWER.critics, ...FIELD_ANSWER.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(FIELD_ANSWER.deriveCriteria.persona.length).toBeGreaterThan(80);
    expect(FIELD_ANSWER.id).toBe('field-answer');
    expect(FIELD_ANSWER.goalSource).toBe('composed');
    expect(FIELD_ANSWER.producer.persona).toContain('field-answer');
    expect(summary.controller.id).toBe('standard');
    expect(FIELD_ANSWER.policy.loop.maxIterations).toBe(1);
  });

  it('[QL-1] every dimension earns from a criterion kind, so none can only fall', () => {
    const earning = new Set(
      Object.values(FIELD_ANSWER.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(FIELD_ANSWER.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
  });

  it('[QL-37] references block and limits warn, the answerer may be briefed with criteria and memories, and only a trap gates', () => {
    const summary = describePipeline(FIELD_ANSWER as never);
    expect(summary.validators).toEqual([
      { id: 'references', gate: 'block' },
      { id: 'limits', gate: 'warn' },
    ]);
    expect(FIELD_ANSWER.producer.consumes).toEqual(['criteria', 'memories']);
    const gated = Object.entries(FIELD_ANSWER.policy.findingTypes)
      .filter(([, mapped]) => mapped.gate)
      .map(([type]) => type);
    expect(gated).toEqual(['trap_answered']);
    const personas = [
      FIELD_ANSWER.deriveCriteria.persona,
      FIELD_ANSWER.producer.persona,
      ...FIELD_ANSWER.critics.map((lens) => lens.persona),
      ...FIELD_ANSWER.evaluators.map((lens) => lens.persona),
    ];
    for (const persona of personas) expect(persona).toContain('field-answer');
    for (const lens of [...FIELD_ANSWER.critics, ...FIELD_ANSWER.evaluators]) {
      expect(lens.persona).toMatch(/field\.1/);
    }
    for (const critic of FIELD_ANSWER.critics) expect(critic.persona).toMatch(/critic's concern/);
    expect(FIELD_ANSWER.deriveCriteria.persona).toContain('Answering policy');
    expect(FIELD_ANSWER.deriveCriteria.persona).toContain('Never do');
    // The grounding critic marks an ungrounded value as the operator's to settle.
    expect(FIELD_ANSWER.critics[0].persona).toContain('requires_user');
  });

  it('[QL-33] every declared output cap is above what its stage has measurably written', () => {
    // SEEDED, not measured: no live answer run has been recorded yet, so these
    // are the most each stage is expected to write for a page of up to 40
    // fields, taken from the shortest recorded pipeline (design-prompt) at
    // comparable prompt sizes. The first live runs (static/runs, 05-llm
    // output tokens) replace this table; a cap is also the call's time limit,
    // so one a stage outwrites is a call cut short.
    const measured: Record<string, number> = {
      criteria: 2_500,
      producer: 4_500,
      'critic.grounding': 4_000,
      'critic.form': 4_000,
      'evaluator.answers': 4_000,
    };
    expect(capsBelowMeasured(FIELD_ANSWER, measured)).toEqual([]);
    const withHeadroom = Object.fromEntries(
      Object.entries(measured).map(([stage, most]) => [stage, Math.ceil(most * 1.2)]),
    );
    expect(capsBelowMeasured(FIELD_ANSWER, withHeadroom)).toEqual([]);
    expect(Object.keys(declaredCaps(FIELD_ANSWER)).sort()).toEqual(Object.keys(measured).sort());
  });

  it('[QL-4] every location the answers expose is printed verbatim where a judge reads it, beside the field’s ref', () => {
    const answers = sampleAnswers();
    const rendered = fieldAnswersOutput.render(answers);
    for (const location of fieldAnswersOutput.locate(answers)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    expect(fieldAnswersOutput.locate(answers).map((location) => location.id)).toEqual([
      'summary',
      'field.1',
      'field.2',
      'field.3',
      'field.4',
      'field.5',
    ]);
    expect(rendered).toContain(
      '[field.1] e1 — answer "6" — confidence high — basis m1 — m1 states six years of Python',
    );
    expect(rendered).toContain('[field.4] e4 — leave-blank — confidence high — basis none');
    expect(fieldAnswersOutput.schema.safeParse(answers).success).toBe(true);
  });

  it('[QL-6] the answers a model writes contain no number', () => {
    const types = jsonSchemaTypes(fieldAnswersOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
