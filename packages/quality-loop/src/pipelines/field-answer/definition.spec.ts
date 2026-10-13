import { boundsAgainstMeasured, fieldAnswersSchema } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline } from '../../core/describe-pipeline';
import { validatePipeline } from '../../core/validate-pipeline';
import { capsAgainstMeasured, jsonSchemaTypes } from '../../core/testing';
import { FIELD_ANSWER } from './definition';
import measured from './measured.json';
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

  it('[QL-37] [QL-68] references block and limits warn, the answerer may be briefed with criteria and memories, and only a trap gates', () => {
    const summary = describePipeline(FIELD_ANSWER as never);
    expect(summary.validators).toEqual([
      { id: 'references', gate: 'block' },
      { id: 'limits', gate: 'warn' },
    ]);
    expect(FIELD_ANSWER.producer.consumes).toEqual(['criteria', 'memories']);
    // The evaluator runs after the critics and is shown what they confirmed.
    expect(FIELD_ANSWER.evaluators.map((lens) => lens.consumes)).toEqual([['findings']]);
    const gated = Object.entries(FIELD_ANSWER.policy.findingTypes)
      .filter(([, mapped]) => mapped.gate)
      .map(([type]) => type);
    expect(gated).toEqual(['trap_answered']);
    // A critic's severity word never vetoes a page: the gate above is the only one.
    expect(FIELD_ANSWER.policy.blockingSeverities).toEqual([]);
    // What each type withholds from the fill is declared: a wrong value every ref, a disagreement about
    // how a true value rests none, a field with no value to withhold none; the limits warning every ref.
    const withholds = Object.fromEntries(
      Object.entries(FIELD_ANSWER.policy.findingTypes).map(([type, mapped]) => [
        type,
        mapped.withholds,
      ]),
    );
    expect(withholds).toEqual({
      ungrounded: 'every-ref',
      overstated: 'none',
      misfit_option: 'every-ref',
      inconsistent: 'every-ref',
      trap_answered: 'every-ref',
      needless_ask: 'none',
      blank_required: 'none',
    });
    expect(FIELD_ANSWER.validators.find((validator) => validator.id === 'limits')?.withholds).toBe(
      'every-ref',
    );
    // The judges name the kinds the answerer declares, in the words of one table.
    expect(FIELD_ANSWER.critics[0].persona).toContain('overstated');
    expect(FIELD_ANSWER.critics[1].persona).toContain('misfit_option');
    for (const kind of [
      'stated',
      'restated',
      'derived',
      'mapped',
      'inferred',
      'composed',
      'policy',
    ]) {
      expect(FIELD_ANSWER.producer.persona).toContain(kind);
    }
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
    // A threshold is answered from a stated figure, declared derived — and the critic grades it as such.
    expect(FIELD_ANSWER.producer.persona).toMatch(/threshold/);
    expect(FIELD_ANSWER.producer.persona).toMatch(/names no subject/);
    expect(FIELD_ANSWER.critics[0].persona).toMatch(/threshold .* derived/);
    // A group describing one unnamed entry of a list is filled from one entry, in the order the policy declares,
    // and an earlier answer to one of its questions settles it only for the entry it was given about.
    expect(FIELD_ANSWER.producer.persona).toMatch(
      /the one the Answering policy's order for that list takes/,
    );
    expect(FIELD_ANSWER.producer.persona).toMatch(
      /settles it only for the entry it was given about/,
    );
    expect(FIELD_ANSWER.critics[0].persona).toMatch(
      /a group mixing entries, or restating an earlier answer/,
    );
    // Whatever its kind, a value claims nothing about the unit of work its evidence does not state, and a part
    // of the question nothing bears on is left out and named — never filled with an unstated stance.
    expect(FIELD_ANSWER.producer.persona).toMatch(/how the subject measures against it/);
    // A composed account lets its particulars speak: measured 2026-10-13, "shows how the subject suits the unit"
    // drew a closing sentence on what the unit calls for, withheld every time.
    expect(FIELD_ANSWER.producer.persona).toMatch(/no sentence of it says what the unit of work/);
    expect(FIELD_ANSWER.producer.persona).toMatch(
      /a part of the question nothing listed bears on is left out/,
    );
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage has measurably written, and every bound the producer is shown sits above what it has written', () => {
    // `measured.json` (`pnpm measure:bounds`, 121 runs as of 2026-10-13) is
    // what each stage measurably wrote. A cap is also the call's time limit,
    // so one a stage outwrites is a call cut short. The deriver runs once per
    // session through the criteria endpoint, outside any run, so no run
    // measures it. A bound the producer overshoots discards the whole artifact:
    // the summary's 600 sat under its own p99 (707) for a month of runs.
    expect(measured.runs).toBeGreaterThan(0);
    expect(boundsAgainstMeasured(fieldAnswersSchema, measured.fields)).toEqual([]);
    expect(
      capsAgainstMeasured(FIELD_ANSWER, measured.caps, {
        exempt: {
          criteria: 'derived once per session through the criteria endpoint, outside any run',
        },
      }),
    ).toEqual([]);
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
      '[field.1] e1 — answer "6" — rests stated — basis m1 — m1 states six years of Python',
    );
    expect(rendered).toContain('[field.4] e4 — leave-blank — rests none — basis none');
    expect(fieldAnswersOutput.schema.safeParse(answers).success).toBe(true);
  });

  it('[QL-6] the answers a model writes contain no number', () => {
    const types = jsonSchemaTypes(fieldAnswersOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
