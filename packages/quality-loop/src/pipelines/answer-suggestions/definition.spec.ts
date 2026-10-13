import { boundsAgainstMeasured } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline } from '../../core/describe-pipeline';
import { validatePipeline } from '../../core/validate-pipeline';
import { capsAgainstMeasured, deriverSchema, jsonSchemaTypes } from '../../core/testing';
import { ANSWER_SUGGESTIONS } from './definition';
import measured from './measured.json';
import { answerSuggestionsOutput } from './output';
import { sampleSuggestions } from './testing';

describe('the answer-suggestions pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it, and every dimension earns from a criterion kind', () => {
    expect(() => validatePipeline(ANSWER_SUGGESTIONS as never)).not.toThrow();
    const summary = describePipeline(ANSWER_SUGGESTIONS as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...ANSWER_SUGGESTIONS.critics, ...ANSWER_SUGGESTIONS.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(ANSWER_SUGGESTIONS.goalSource).toBe('composed');
    expect(summary.controller.id).toBe('standard');
    const earning = new Set(
      Object.values(ANSWER_SUGGESTIONS.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(ANSWER_SUGGESTIONS.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
  });

  it('[QL-64] fixes what each label promises, withholds every faulted suggestion but a repeat, gates nothing, and runs once with the evaluator beside the critics', () => {
    const summary = describePipeline(ANSWER_SUGGESTIONS as never);
    expect(summary.validators).toEqual([
      { id: 'references', gate: 'block' },
      { id: 'citations', gate: 'warn' },
      { id: 'limits', gate: 'warn' },
    ]);
    expect(ANSWER_SUGGESTIONS.task.fixedCriteria?.map((criterion) => criterion.kind)).toEqual([
      'grounding',
      'grounding',
      'grounding',
      'fit',
    ]);
    const types = Object.entries(ANSWER_SUGGESTIONS.policy.findingTypes);
    expect(types.filter(([, mapped]) => mapped.gate)).toEqual([]);
    expect(
      types.filter(([, mapped]) => mapped.withholds !== 'every-ref').map(([type]) => type),
    ).toEqual(['duplicate']);
    expect(ANSWER_SUGGESTIONS.policy.blockingSeverities).toEqual([]);
    expect(ANSWER_SUGGESTIONS.policy.loop.maxIterations).toBe(1);
    expect(ANSWER_SUGGESTIONS.evaluators.map((lens) => lens.consumes)).toEqual([[]]);
    // Each critic owns its finding types and names the other's as not its own.
    const [grounding, fit] = ANSWER_SUGGESTIONS.critics;
    for (const type of ['ungrounded', 'mislabelled', 'boundary_crossed']) {
      expect(grounding?.persona).toContain(`(${type})`);
    }
    for (const type of ['off_question', 'unusable', 'duplicate', 'policy_breach']) {
      expect(fit?.persona).toContain(`(${type})`);
    }
    for (const critic of ANSWER_SUGGESTIONS.critics)
      expect(critic.persona).toMatch(/critic's concern/);
    const personas = [
      ANSWER_SUGGESTIONS.deriveCriteria.persona,
      ANSWER_SUGGESTIONS.producer.persona,
      ...ANSWER_SUGGESTIONS.critics.map((lens) => lens.persona),
      ...ANSWER_SUGGESTIONS.evaluators.map((lens) => lens.persona),
    ];
    for (const persona of personas) {
      expect(persona).toContain('answer-suggestions');
      expect(persona).toContain('Suggesting policy');
    }
    for (const lens of [...ANSWER_SUGGESTIONS.critics, ...ANSWER_SUGGESTIONS.evaluators]) {
      expect(lens.persona).toMatch(/field\.1\.\d/);
    }
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage has measurably written', () => {
    // `measured.json` is this pipeline's own runs. A cap is also the call's
    // time limit, so one a stage outwrites is a call cut short.
    expect(measured.runs).toBeGreaterThan(0);
    expect(
      capsAgainstMeasured(ANSWER_SUGGESTIONS, measured.caps, {
        exempt: {
          criteria: 'derived once per session through the criteria endpoint, outside any run',
        },
      }),
    ).toEqual([]);
  });

  it('[QL-4] [QL-49] every bound its producer and deriver are shown sits above what they have measurably written', () => {
    // The deriver is measured too where a run derived its own criteria — a replay through POST /runs, outside a session.
    expect(
      boundsAgainstMeasured(
        [answerSuggestionsOutput.schema, deriverSchema(ANSWER_SUGGESTIONS.task)],
        measured.fields,
      ),
    ).toEqual([]);
  });

  it('[QL-4] every location the suggestions expose is printed verbatim where a judge reads it, beside the field’s ref', () => {
    const suggested = sampleSuggestions();
    const rendered = answerSuggestionsOutput.render(suggested);
    const locations = answerSuggestionsOutput.locate(suggested).map((location) => location.id);
    for (const location of locations) expect(rendered).toContain(`[${location}]`);
    expect(locations).toEqual([
      'summary',
      'field.1',
      'field.1.1',
      'field.2',
      'field.3',
      'field.3.1',
      'field.3.2',
    ]);
    expect(rendered).toContain(
      '[field.1.1] record — cites m1 — "6" — why: m1 states six years of Python',
    );
    expect(rendered).toContain('[field.2] e2 — no suggestions');
    expect(answerSuggestionsOutput.schema.safeParse(suggested).success).toBe(true);
  });

  it('[QL-6] the suggestions a model writes contain no number', () => {
    const types = jsonSchemaTypes(answerSuggestionsOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
