import {
  boundsAgainstMeasured,
  interviewTurnOutputSchema,
  INTERVIEW_PIPELINE_ID,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline } from '../../core/describe-pipeline';
import { capsAgainstMeasured, deriverSchema, seededCaps } from '../../core/testing';
import { validatePipeline } from '../../core/validate-pipeline';
import { INTERVIEW_TURN } from './definition';
import measured from './measured.json';
import { interviewTurnOutput } from './output';
import { sampleTurn } from './testing';

describe('the interview-turn pipeline', () => {
  it('[QL-1] [DEL-10] is valid data with md personas loaded beside it, composed by another program, one iteration, nothing gating', () => {
    expect(() => validatePipeline(INTERVIEW_TURN as never)).not.toThrow();
    const summary = describePipeline(INTERVIEW_TURN as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...INTERVIEW_TURN.critics, ...INTERVIEW_TURN.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(INTERVIEW_TURN.id).toBe(INTERVIEW_PIPELINE_ID);
    expect(INTERVIEW_TURN.goalSource).toBe('composed');
    expect(INTERVIEW_TURN.policy.loop.maxIterations).toBe(1);
    expect(INTERVIEW_TURN.policy.blockingSeverities).toEqual([]);
    expect(Object.values(INTERVIEW_TURN.policy.criterionKinds).every((kind) => !kind.gate)).toBe(
      true,
    );
    expect(Object.values(INTERVIEW_TURN.policy.findingTypes).every((type) => !type.gate)).toBe(
      true,
    );
    // Three fixed rules, one per dimension: every turn is judged on the same things.
    expect(INTERVIEW_TURN.task.fixedCriteria?.map((criterion) => criterion.kind)).toEqual([
      'fidelity',
      'restraint',
      'clarity',
    ]);
  });

  it('[QL-1] every dimension earns from a criterion kind, and every finding type is owned by the one critic', () => {
    const earning = new Set(
      Object.values(INTERVIEW_TURN.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(INTERVIEW_TURN.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
    const owned = INTERVIEW_TURN.critics.flatMap((critic) => critic.findingTypes ?? []);
    expect([...owned].sort()).toEqual(Object.keys(INTERVIEW_TURN.task.findingTypes).sort());
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above the seed it holds until this pipeline is measured', () => {
    // No turn has been recorded yet: every stage holds the most the
    // design-prompt pipeline's matching stage wrote (4 runs, 2026-09-30 to
    // 10-01); `pnpm measure:bounds --pipeline=interview-turn` replaces a seed
    // the moment a measurement exists.
    const seeds = seededCaps({
      criteria: 637,
      producer: 6693,
      'critic.conduct': 7592,
      'evaluator.turn': 5700,
    });
    expect(capsAgainstMeasured(INTERVIEW_TURN, { ...seeds, ...measured.caps })).toEqual([]);
    const unmeasured = 'declared with the pipeline; no turn has been recorded yet';
    expect(
      boundsAgainstMeasured(deriverSchema(INTERVIEW_TURN.task), measured.fields, {
        exempt: { criteria: unmeasured, 'criteria[].statement': unmeasured },
      }),
    ).toEqual([]);
    expect(
      boundsAgainstMeasured(interviewTurnOutputSchema, measured.fields, {
        exempt: {
          replies: unmeasured,
          'replies[].to': unmeasured,
          'replies[].text': unmeasured,
          'replies[].disclosesCriterionIds': unmeasured,
          'replies[].disclosesCriterionIds[]': unmeasured,
        },
      }),
    ).toEqual([]);
  });

  it('[QL-4] every reply is printed where a judge reads it, with what it discloses beside it', () => {
    const turn = sampleTurn();
    const rendered = interviewTurnOutput.render(turn);
    for (const location of interviewTurnOutput.locate(turn)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    expect(interviewTurnOutput.locate(turn).map((location) => location.id)).toEqual([
      'reply.1',
      'reply.2',
    ]);
    expect(rendered).toContain('[reply.1] to question.1: Reads should answer');
    expect(rendered).toContain('(discloses c3)');
    expect(rendered.split('\n')[1]).not.toContain('discloses');
    expect(interviewTurnOutput.render({ replies: [] })).toBe('(no replies)');
  });
});
