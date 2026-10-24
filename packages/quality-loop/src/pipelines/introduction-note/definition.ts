/**
 * An introduction note: one firm writing to a named reader at another about
 * one named program, asking for a small piece of its work. The goal is
 * composed by another program — the reader, the program as its record
 * states it, the sender's facts, the offers with an id each, the ask — and
 * the artifact is the note in parts a judge can cite.
 *
 * Four fixed rules, two per dimension, so every note is judged on the same
 * things whatever the program: fidelity and relevance are its substance,
 * restraint and clarity its conduct. Two iterations: a note the judges found
 * wanting is written once more with their findings; nothing gates, since the
 * composer shows the decision beside the note and a person sends it or not.
 */
import {
  INTRODUCTION_NOTE_ITERATIONS,
  INTRODUCTION_NOTE_PIPELINE_ID,
  INTRODUCTION_NOTE_RULES,
} from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import { MAX_CRITERIA } from './input';
import criticClaims from './lenses/critic.claims.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorNote from './lenses/evaluator.note.md?raw';
import producer from './lenses/producer.md?raw';
import { introductionNoteOutput } from './output';
import { referencesValidator } from './validators';

export const INTRODUCTION_NOTE: PipelineDefinition<
  ReturnType<typeof introductionNoteOutput.schema.parse>
> = {
  id: INTRODUCTION_NOTE_PIPELINE_ID,
  version: '1.0.0',

  // A goal another program composes; never a route, a target, or a choice in the UI.
  goalSource: 'composed',
  description:
    'A short introduction from one firm to a named reader at another firm about one named program, written from the program’s record and the sender’s listed offers, judged for fidelity to both, relevance to the described work, restraint, and clarity.',

  task: {
    criterionKinds: {
      fidelity:
        'A rule that every claim about the sender comes from a listed offer or the sender’s facts, and every claim about the program from its record.',
      relevance:
        'A rule that the program is named by its contract number and buyer, and each offer connects to what the program’s description says the work is.',
      restraint:
        'A rule that the note states no price, résumé, unstated past performance or flattery, and asks one thing.',
      clarity: 'A rule that each part reads in one breath, in words a busy reader can act on.',
    },
    findingTypes: {
      unbacked_claim:
        'A figure, name, clearance, relationship, result or past performance the note states that the goal does not.',
      mismatch:
        'A program named other than by its own contract number and buyer, or an offer line that does not connect to the described work.',
      overreach:
        'A price, a résumé, flattery, a promise the sender’s facts do not support, or a second thing asked.',
      unclear_ask:
        'An ask the reader cannot act on, a part that runs past one breath, or a note that never says why the sender writes.',
    },
    maxCriteria: MAX_CRITERIA,
    // Fixed, so every note is judged on the same four rules; the deriver adds
    // one only where the goal states a rule of its own.
    fixedCriteria: [...INTRODUCTION_NOTE_RULES],
    output: introductionNoteOutput,
  },

  // Caps a fifth or more above what a note is expected to cost — seeded in
  // the spec from the interview turn's measured critic and evaluator and a
  // producer sized for a note of a few hundred words — until the first live
  // runs are measured and re-pinned from `measured.json`.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 2000 },
  producer: { persona: producer, maxTokens: 4000, consumes: ['criteria'] },
  validators: [referencesValidator],
  controller: STANDARD,

  critics: [
    {
      id: 'critic.claims',
      persona: criticClaims,
      samples: 2,
      maxItems: 8,
      maxTokens: 16000,
      findingTypes: ['unbacked_claim', 'mismatch', 'overreach', 'unclear_ask'],
    },
  ],

  evaluators: [
    {
      id: 'evaluator.note',
      persona: evaluatorNote,
      samples: 2,
      consumes: ['findings'],
      maxTokens: 7000,
      criterionKinds: ['fidelity', 'relevance', 'restraint', 'clarity'],
    },
  ],

  policy: {
    version: '1',
    dimensionWeights: { substance: 0.6, conduct: 0.4 },
    criterionKinds: {
      fidelity: { dimension: 'substance', weight: 1, gate: false },
      relevance: { dimension: 'substance', weight: 1, gate: false },
      restraint: { dimension: 'conduct', weight: 1, gate: false },
      clarity: { dimension: 'conduct', weight: 1, gate: false },
    },
    // Nothing gates: the composer shows the decision beside the note, and a
    // person sends it or not. A note the judges found wanting gets one
    // revision, and that is the loop.
    findingTypes: {
      unbacked_claim: { dimension: 'substance', gate: false },
      mismatch: { dimension: 'substance', gate: false },
      overreach: { dimension: 'conduct', gate: false },
      unclear_ask: { dimension: 'conduct', gate: false },
    },
    ...STANDARD_SCORING,
    blockingSeverities: [],
    evidence: { minHits: 2, minAssessedShare: 0.75 },
    thresholds: { acceptAt: 75, rejectBelow: 30 },
    loop: {
      maxIterations: INTRODUCTION_NOTE_ITERATIONS,
      plateauAfter: 1,
      concurrency: 2,
      lostProduces: 1,
    },
  },
};
