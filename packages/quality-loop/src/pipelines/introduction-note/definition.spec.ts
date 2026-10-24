import {
  boundsAgainstMeasured,
  introductionNoteOutputSchema,
  INTRODUCTION_NOTE_PIPELINE_ID,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline } from '../../core/describe-pipeline';
import { capsAgainstMeasured, deriverSchema, seededCaps } from '../../core/testing';
import { validatePipeline } from '../../core/validate-pipeline';
import { INTRODUCTION_NOTE } from './definition';
import measured from './measured.json';
import { introductionNoteOutput } from './output';
import { sampleNote } from './testing';

describe('the introduction-note pipeline', () => {
  it('[QL-1] [QL-82] is valid data with md personas loaded beside it, composed by another program, two iterations, nothing gating, four fixed rules two per dimension', () => {
    expect(() => validatePipeline(INTRODUCTION_NOTE as never)).not.toThrow();
    const summary = describePipeline(INTRODUCTION_NOTE as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...INTRODUCTION_NOTE.critics, ...INTRODUCTION_NOTE.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(INTRODUCTION_NOTE.id).toBe(INTRODUCTION_NOTE_PIPELINE_ID);
    expect(INTRODUCTION_NOTE.goalSource).toBe('composed');
    expect(INTRODUCTION_NOTE.policy.loop.maxIterations).toBe(2);
    expect(INTRODUCTION_NOTE.policy.blockingSeverities).toEqual([]);
    expect(Object.values(INTRODUCTION_NOTE.policy.criterionKinds).every((kind) => !kind.gate)).toBe(
      true,
    );
    expect(Object.values(INTRODUCTION_NOTE.policy.findingTypes).every((type) => !type.gate)).toBe(
      true,
    );
    expect(INTRODUCTION_NOTE.task.fixedCriteria?.map((criterion) => criterion.kind)).toEqual([
      'fidelity',
      'relevance',
      'restraint',
      'clarity',
    ]);
    expect(
      Object.entries(INTRODUCTION_NOTE.policy.criterionKinds).map(([kind, priced]) => [
        kind,
        priced.dimension,
      ]),
    ).toEqual([
      ['fidelity', 'substance'],
      ['relevance', 'substance'],
      ['restraint', 'conduct'],
      ['clarity', 'conduct'],
    ]);
  });

  it('[QL-1] every dimension earns from a criterion kind, and every finding type is owned by the one critic', () => {
    const earning = new Set(
      Object.values(INTRODUCTION_NOTE.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(INTRODUCTION_NOTE.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
    const owned = INTRODUCTION_NOTE.critics.flatMap((critic) => critic.findingTypes ?? []);
    expect([...owned].sort()).toEqual(Object.keys(INTRODUCTION_NOTE.task.findingTypes).sort());
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage has measurably written, and every note field is asked for at least what was written', () => {
    // `measured.json`, refreshed by `pnpm measure:bounds --pipeline=introduction-note`.
    // A cap is also the call's time limit, so one a stage outwrites is a call
    // cut short. The deriver is never called for a note (the composer supplies
    // the rubric), so its stage holds the design-prompt deriver's measurement
    // as a seed and its fields are exempt until a note derives; the one fixture
    // holds what the deriver and the producer write, so both schemas are held
    // to it together.
    expect(measured.runs).toBeGreaterThan(0);
    const seeds = seededCaps({ criteria: 637 });
    expect(capsAgainstMeasured(INTRODUCTION_NOTE, { ...seeds, ...measured.caps })).toEqual([]);
    const unmeasured = 'the composer supplies every note’s rubric; no note has derived one';
    expect(
      boundsAgainstMeasured(
        [deriverSchema(INTRODUCTION_NOTE.task), introductionNoteOutputSchema],
        measured.fields,
        { exempt: { criteria: unmeasured, 'criteria[].statement': unmeasured } },
      ),
    ).toEqual([]);
  });

  it('[QL-4] every part of the note is printed where a judge reads it, in the order the note reads', () => {
    const note = sampleNote();
    const rendered = introductionNoteOutput.render(note);
    for (const location of introductionNoteOutput.locate(note)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    expect(introductionNoteOutput.locate(note).map((location) => location.id)).toEqual([
      'subject',
      'opening',
      'program',
      'offer.1',
      'offer.2',
      'ask',
      'closing',
    ]);
    expect(rendered).toContain('[program] 47QFCA22F0018');
    expect(rendered).toContain('[offer.2] (offer.3) We stand up automated regression');
  });
});
