/**
 * The interviewer's turn: one exchange of an interview session, answered by
 * a model that has the whole problem and a candidate who has seen only its
 * opening. The goal is composed by the studio — the prompt as the
 * interviewer's notes, the rubric with ids, the transcript so far, and the
 * items to address, indexed — and the artifact is one reply per item, with
 * the rubric criteria each reply gives away declared beside it, so the
 * candidate's view can disclose them and nothing else.
 *
 * Three fixed rules, one each per dimension, so every turn is judged on the
 * same three things whatever the prompt: fidelity to the notes, restraint,
 * and clarity. One iteration: the reply is claimed whatever the judges
 * decided, and the decision is shown beside it. Two samples and two hits to
 * confirm: a reply is accused of giving the answer away only when both
 * samples of the critic saw it.
 */
import {
  INTERVIEW_PIPELINE_ID,
  INTERVIEW_TURN_ITERATIONS,
  INTERVIEW_TURN_RULES,
} from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import { MAX_CRITERIA } from './input';
import criticConduct from './lenses/critic.conduct.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorTurn from './lenses/evaluator.turn.md?raw';
import producer from './lenses/producer.md?raw';
import { interviewTurnOutput } from './output';
import { coverageValidator, referencesValidator } from './validators';

export const INTERVIEW_TURN: PipelineDefinition<
  ReturnType<typeof interviewTurnOutput.schema.parse>
> = {
  id: INTERVIEW_PIPELINE_ID,
  version: '1.0.0',

  // A goal another program composes; never a route, a target, or a choice in the UI.
  goalSource: 'composed',
  description:
    "One turn of a system-design interview: the interviewer's replies to the candidate's questions, or its probing questions on what the design has not addressed, judged for fidelity to the interviewer's notes, for giving nothing away, and for clarity.",

  task: {
    criterionKinds: {
      fidelity:
        'A rule that a reply states only what the interviewer’s notes state, and says so where the notes are silent.',
      restraint:
        'A rule that a reply proposes, hints at or endorses no design, and declares exactly the rubric criteria it gives away.',
      clarity:
        'A rule that every item is addressed directly, in an interviewer’s spoken voice, briefly.',
    },
    findingTypes: {
      invented_fact:
        'A fact, figure, preference or decision a reply states that the interviewer’s notes do not.',
      answer_leaked:
        'A mechanism, component, pattern or “you could” in a reply, or a probe that names the answer it is meant to elicit.',
      undeclared_disclosure:
        'A reply that gives a rubric criterion away without listing it, or lists one it did not give away.',
      unaddressed_item:
        'An item answered beside the point, in a way the candidate cannot act on, or at a length no interviewer would speak.',
    },
    maxCriteria: MAX_CRITERIA,
    // Fixed, so every turn is judged on the same three rules; the deriver
    // adds one only where the notes state a rule for the interviewer.
    fixedCriteria: [...INTERVIEW_TURN_RULES],
    output: interviewTurnOutput,
  },

  // Caps a fifth or more above what the first live turns wrote (2 runs,
  // 2026-10-20: producer 349, conduct critic 13,254, turn evaluator 3,642 —
  // the critic reasons at length over a short reply) or, for the deriver no
  // studio turn calls, above the design-prompt deriver's 637; re-pinned from
  // `measured.json` as turns accumulate.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 2000 },
  producer: { persona: producer, maxTokens: 8500, consumes: ['criteria'] },
  validators: [referencesValidator, coverageValidator],
  controller: STANDARD,

  critics: [
    {
      id: 'critic.conduct',
      persona: criticConduct,
      samples: 2,
      maxItems: 8,
      maxTokens: 16000,
      findingTypes: ['invented_fact', 'answer_leaked', 'undeclared_disclosure', 'unaddressed_item'],
    },
  ],

  evaluators: [
    {
      id: 'evaluator.turn',
      persona: evaluatorTurn,
      samples: 2,
      consumes: ['findings'],
      maxTokens: 7000,
      criterionKinds: ['fidelity', 'restraint', 'clarity'],
    },
  ],

  policy: {
    version: '1',
    dimensionWeights: { fidelity: 0.4, restraint: 0.4, clarity: 0.2 },
    criterionKinds: {
      fidelity: { dimension: 'fidelity', weight: 1, gate: false },
      restraint: { dimension: 'restraint', weight: 1, gate: false },
      clarity: { dimension: 'clarity', weight: 1, gate: false },
    },
    // Nothing gates: the studio claims the reply whatever was decided and
    // shows the decision beside it. A turn is one iteration; there is no
    // second ask to gate toward.
    findingTypes: {
      invented_fact: { dimension: 'fidelity', gate: false },
      answer_leaked: { dimension: 'restraint', gate: false },
      undeclared_disclosure: { dimension: 'restraint', gate: false },
      unaddressed_item: { dimension: 'clarity', gate: false },
    },
    ...STANDARD_SCORING,
    blockingSeverities: [],
    evidence: { minHits: 2, minAssessedShare: 0.75 },
    thresholds: { acceptAt: 75, rejectBelow: 30 },
    loop: {
      maxIterations: INTERVIEW_TURN_ITERATIONS,
      plateauAfter: 1,
      concurrency: 2,
      lostProduces: 1,
    },
  },
};
