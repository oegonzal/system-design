import {
  boundsAgainstMeasured,
  introductionNoteOutputSchema,
  INTRODUCTION_NOTE_PIPELINE_ID,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline } from '../../core/describe-pipeline';
import {
  allStages,
  capsAgainstMeasured,
  deriverSchema,
  seededCaps,
  seededFields,
  unseededFields,
} from '../../core/testing';
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

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage is expected to write, and above what it has measurably written', () => {
    // SEEDED: the deriver from the design-prompt deriver's 637; the critic and
    // the evaluator from the interview turn's measured 13,254 and 3,642 (a
    // critic reasons at length over a short artifact); the producer sized for
    // a note of a few hundred words in JSON. The first live notes replace the
    // seeds through `measured.json` (`pnpm measure:bounds --pipeline=introduction-note`).
    const seeds = {
      criteria: 637,
      producer: 1_500,
      'critic.claims': 13_254,
      'evaluator.note': 3_642,
    };
    expect(capsAgainstMeasured(INTRODUCTION_NOTE, seededCaps(seeds))).toEqual([]);
    const unrecorded =
      measured.runs === 0 ? allStages(INTRODUCTION_NOTE, 'no introduction-note run recorded') : {};
    expect(capsAgainstMeasured(INTRODUCTION_NOTE, measured.caps, { exempt: unrecorded })).toEqual(
      [],
    );
    const unmeasured = 'the composer supplies every note’s rubric; no note has derived one';
    expect(
      boundsAgainstMeasured(
        deriverSchema(INTRODUCTION_NOTE.task),
        {},
        {
          exempt: { criteria: unmeasured, 'criteria[].statement': unmeasured },
        },
      ),
    ).toEqual([]);
  });

  it('[QL-4] every prose bound sits above the longest its path is expected to be written, and every part is printed where a judge reads it', () => {
    // SEEDED from the sample note's own parts, lengthened by a third.
    const seeds = {
      subject: 70,
      opening: 240,
      'offerLines[].line': 160,
      'offerLines[].offerId': 7,
      'programReference.piid': 20,
      ask: 170,
      closing: 200,
    };
    const schema = introductionNoteOutput.schema;
    expect(
      boundsAgainstMeasured(introductionNoteOutputSchema, seededFields(seeds), {
        exempt: unseededFields(schema, seeds, 'no introduction-note run recorded, and no seed'),
      }),
    ).toEqual([]);

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
