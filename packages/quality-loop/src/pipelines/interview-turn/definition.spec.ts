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

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage has measurably written, and every reply field is asked for at least what was written', () => {
    // `measured.json`, refreshed by `pnpm measure:bounds --pipeline=interview-turn`.
    // A cap is also the call's time limit, so one a stage outwrites is a call
    // cut short. The deriver is never called by a studio turn (the rubric is
    // supplied), so its stage and fields hold the design-prompt deriver's
    // measurement as a seed until a turn derives.
    expect(measured.runs).toBeGreaterThan(0);
    const seeds = seededCaps({ criteria: 637 });
    expect(capsAgainstMeasured(INTERVIEW_TURN, { ...seeds, ...measured.caps })).toEqual([]);
    const fieldsUnder = (prefix: string) =>
      Object.fromEntries(
        Object.entries(measured.fields).filter(([path]) => path.startsWith(prefix)),
      );
    const unmeasured = 'the studio supplies every turn’s rubric; no turn has derived one';
    expect(
      boundsAgainstMeasured(deriverSchema(INTERVIEW_TURN.task), fieldsUnder('criteria'), {
        exempt: { criteria: unmeasured, 'criteria[].statement': unmeasured },
      }),
    ).toEqual([]);
    expect(boundsAgainstMeasured(interviewTurnOutputSchema, fieldsUnder('replies'))).toEqual([]);
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
