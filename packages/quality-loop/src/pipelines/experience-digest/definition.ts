/**
 * The third pipeline: judge what a finished run of any pipeline taught, and
 * distil it into memories worth keeping. Everything here is data —
 * vocabularies, md personas, samples and the policy — except the digest's
 * `OutputShape`, the record codec and composer beside it, and two exact
 * validators.
 */
import { LARGEST_STATEMENT_BOUND } from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import { EXPERIENCE_DIGEST_ID } from './input';
import criticAttribution from './lenses/critic.attribution.md?raw';
import criticProvenance from './lenses/critic.provenance.md?raw';
import criticTransfer from './lenses/critic.transfer.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorAttribution from './lenses/evaluator.attribution.md?raw';
import producer from './lenses/producer.md?raw';
import { experienceDigestOutput, type ExperienceDigest } from './output';
import { limitsValidator, referencesValidator } from './validators';

const MAX_CRITERIA = 16;

export const EXPERIENCE_DIGEST: PipelineDefinition<ExperienceDigest> = {
  id: EXPERIENCE_DIGEST_ID,
  version: '1.0.0',

  // A goal another program composes; never a route, a target, or a choice in the UI.
  goalSource: 'composed',
  description:
    'A finished run of any pipeline, judged for what its evidence shows moved quality, and distilled into memories worth keeping.',

  task: {
    criterionKinds: {
      signal:
        'An evidence item the record shows the loop acted on — a selected remediation, a closed gate, a failed or partial criterion — that the digest must account for.',
      transition:
        'A change the record shows across iterations — a finding persisted or resolved, a criterion improved or regressed, a dimension moved — that the digest must explain.',
    },
    findingTypes: {
      missed_signal:
        'Acted-on evidence left unused although the record shows it drove the outcome.',
      unsupported_effect: 'A memory claims an effect on quality the record does not show.',
      misattributed_evidence: 'An insight that is not what its cited evidence says.',
      run_specific: "An insight that holds only for this run's prompt or artifact.",
      vague_insight: 'An insight a future producer could not act on.',
      duplicate_memory: 'Two memories teaching the same thing.',
    },
    maxCriteria: MAX_CRITERIA,
    // The statement bound the deriver writes within, and the one the edge's
    // cap on a supplied statement is sized from, so it is declared once, in
    // contracts. Its target is above the longest this deriver has measurably
    // written (751 characters, across the recorded runs to 2026-10-02 — and
    // that was a second mode of a persona that asked for aliases and
    // iterations), with headroom; past the ceiling a statement is kept and
    // recorded rather than discarding the rubric.
    statementBound: LARGEST_STATEMENT_BOUND,
    output: experienceDigestOutput,
  },

  // Sized from the recorded runs (the spec holds the measurements): a cap is
  // also the call's time limit (`callTimeLimitMs`), so a cap a stage
  // outwrites is a call cut short. The deriver has written 9,350 output
  // tokens for one record (2026-10-02, past its old 8,000), the producer
  // 31,719, the critics up to 32,261 — each cap a fifth above its stage's.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 12000 },
  producer: { persona: producer, maxTokens: 40000, consumes: ['criteria'] },
  validators: [referencesValidator, limitsValidator],
  controller: STANDARD,

  critics: [
    {
      id: 'critic.attribution',
      persona: criticAttribution,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 36000,
    },
    {
      id: 'critic.provenance',
      persona: criticProvenance,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 40000,
    },
    {
      id: 'critic.transfer',
      persona: criticTransfer,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 24000,
    },
  ],

  evaluators: [
    {
      id: 'evaluator.attribution',
      persona: evaluatorAttribution,
      samples: 2,
      consumes: [],
      maxItems: MAX_CRITERIA,
      maxTokens: 16000,
      criterionKinds: ['signal', 'transition'],
    },
  ],

  policy: {
    version: '1',
    dimensionWeights: {
      attribution: 0.4,
      fidelity: 0.3,
      reuse: 0.3,
    },
    criterionKinds: {
      signal: {
        dimension: 'attribution',
        weight: 1,
        gate: false,
      },
      transition: {
        dimension: 'attribution',
        weight: 1,
        gate: false,
      },
    },
    // `fidelity` and `reuse` are priced by findings alone: a digest with none
    // of either starts them at 100,
    // and a digest nobody faulted renormalises
    // them out.
    //
    // `withholds` is what a confirmed finding does to the memories it names
    // when the store reads the digest (`withheldItems`), declared by what
    // storing the memory as written would put in the store: an effect the
    // record does not show, a misattribution or a lesson only this run's
    // names make true would be false there, so it is withheld; a vague
    // wording is weaker, not wrong — its remedy is a rewrite — and a missed
    // signal is a gap that names a memory without faulting it. A duplicate
    // group withholds nothing: its confirmed set is a component of
    // overlapping claims, not one claim, so any member may be a bystander
    // (`WITHHOLDINGS` says why).
    findingTypes: {
      missed_signal: {
        dimension: 'attribution',
        gate: false,
        withholds: 'none',
      },
      unsupported_effect: {
        dimension: 'attribution',
        gate: false,
        withholds: 'every-ref',
      },
      misattributed_evidence: {
        dimension: 'fidelity',
        gate: true,
        withholds: 'every-ref',
      },
      // Gated, unlike its two neighbours in `reuse`: a memory that holds only
      // for this run's names and numbers is the one failure a later prompt
      // cannot recover from, and pricing it cannot stop it being stored — a
      // digest with `reuse` penalised to the cap still scores 82, over the
      // bar. Vagueness and duplication cost a reader little and stay priced.
      run_specific: {
        dimension: 'reuse',
        gate: true,
        withholds: 'every-ref',
      },
      vague_insight: {
        dimension: 'reuse',
        gate: false,
        withholds: 'none',
      },
      duplicate_memory: {
        dimension: 'reuse',
        gate: false,
        withholds: 'none',
      },
    },
    ...STANDARD_SCORING,
    // Two samples everywhere and two hits to confirm: the gated
    // `misattributed_evidence` needs both samples of a critic to agree.
    evidence: { minHits: 2, minAssessedShare: 0.75, lostSample: 'score-only' },
    thresholds: { acceptAt: 75, rejectBelow: 30 },
    loop: { maxIterations: 2, plateauAfter: 2, concurrency: 2, lostProduces: 1 },
  },
};
