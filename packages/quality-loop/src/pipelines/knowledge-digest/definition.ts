/**
 * The tenth pipeline: judge what a finished run of any pipeline adds to what the
 * store already knows, and type it as knowledge worth keeping. Everything here
 * is data — vocabularies, md personas, samples and the policy — except the
 * digest's `OutputShape`, the record codec and composer beside it, and five
 * exact validators.
 *
 * It is the experience digest's sibling, and the differences are the measured
 * lessons of ninety-four recorded runs of that one:
 *
 * - `coverage` replaces `attribution`, and `held` is a criterion kind of its
 *   own, because 477 of 1,713 criterion aliases went unused: the rubric only
 *   ever demanded evidence the loop acted on, so nothing was graded on what
 *   worked and 29 of 386 stored chunks came from an accepted iteration.
 * - `missed_signal` is not a finding type here. A gap is graded by the coverage
 *   evaluator's fail, not faulted as a defect in an item — in the parent, 20 of
 *   21 confirmed `missed_signal` findings named an item they were not faulting,
 *   and 40 items were excluded for an omission elsewhere.
 * - `unsupported_effect` lands on `fidelity` and the attribution critic merges
 *   into grounding: cause is a statement-against-evidence check, so one lens
 *   does it.
 * - `ungrounded_fact` is gated beside `misattributed_evidence`. A false fact
 *   stored is the worst outcome a corpus can have, because every later run that
 *   recalls it inherits it.
 * - `novelty` is new, light and ungated while its personas are unproven: a
 *   wrong confirmation is a link, removable per run, where a wrong fact is not.
 */
import { bound } from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import { KNOWLEDGE_DIGEST_ID } from './input';
import criticGenerality from './lenses/critic.generality.md?raw';
import criticGrounding from './lenses/critic.grounding.md?raw';
import criticNovelty from './lenses/critic.novelty.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorCoverage from './lenses/evaluator.coverage.md?raw';
import evaluatorNovelty from './lenses/evaluator.novelty.md?raw';
import producer from './lenses/producer.md?raw';
import { knowledgeDigestOutput, type KnowledgeDigest } from './output';
import {
  dimensionValidator,
  generalityValidator,
  kindsValidator,
  limitsValidator,
  referencesValidator,
} from './validators';

/** Signals, transitions, held criteria and one delta per known item the evidence touches. */
const MAX_CRITERIA = 20;

/**
 * The statement bound the deriver writes within. The parent's bound, for the
 * parent's reason: 400 characters lost a whole digest when one overlong
 * statement discarded the rubric and the run scored zero, and the longest ever
 * measured is 751. A delta criterion names a known item, which is the same
 * register as the aliases and iterations that ran long there. Past the ceiling
 * a statement is kept and recorded rather than discarding the rubric.
 */
const STATEMENT_BOUND = bound(1200);

export const KNOWLEDGE_DIGEST: PipelineDefinition<KnowledgeDigest> = {
  id: KNOWLEDGE_DIGEST_ID,
  version: '1.0.0',

  // A goal another program composes; never a route, a target, or a choice in the UI.
  goalSource: 'composed',
  description:
    'A finished run of any pipeline, judged against what the store already knows, and typed as knowledge worth keeping: facts, anti-patterns, patterns and procedures.',

  task: {
    criterionKinds: {
      signal:
        'An evidence item the record shows the loop acted on — a selected remediation, a closed gate, a failed or partial criterion — that the digest must account for.',
      transition:
        'A change the record shows across iterations — a finding persisted or resolved, a criterion improved or regressed, a dimension moved — that the digest must explain.',
      held: 'A criterion that passed in every iteration it was assessed in, under a mechanism the artifact states, which the digest must account for as something that worked.',
      delta:
        'An already-known item the record’s evidence bears on, which the digest must confirm or contradict by its alias.',
    },
    findingTypes: {
      misattributed_evidence: 'An insight that is not what its cited evidence says.',
      ungrounded_fact:
        'A fact that is not true with this design removed, or that its evidence does not establish.',
      unsupported_effect: 'An item claims an effect on quality the record does not show.',
      wrong_kind: 'An item whose kind its cited evidence cannot support.',
      run_specific: 'An insight that holds only for this run’s names, figures or artifact.',
      vague_item:
        'An insight a future producer could not act on, or a condition no search could match.',
      duplicate_item: 'Two items teaching the same thing.',
      restated_known: 'An item that teaches what a known item teaches without confirming it.',
      false_confirmation: 'An item confirms a known item its evidence does not bear on.',
      false_contradiction: 'An item contradicts a known item the evidence does not contradict.',
    },
    maxCriteria: MAX_CRITERIA,
    statementBound: STATEMENT_BOUND,
    output: knowledgeDigestOutput,
  },

  // Sized from the parent's measured calls, the knowledge record being the
  // larger goal and the item the richer answer: the parent's deriver wrote
  // 9,350 output tokens, its producer 31,719 for 8 items — against a 32,000
  // cap, which is also the call's time limit — and its critics up to 32,261.
  // This pipeline's own runs replace the seeds through `measured.json`.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 12000 },
  producer: { persona: producer, maxTokens: 48000, consumes: ['criteria'] },
  validators: [
    referencesValidator,
    limitsValidator,
    generalityValidator,
    dimensionValidator,
    kindsValidator,
  ],
  controller: STANDARD,

  critics: [
    {
      id: 'critic.grounding',
      persona: criticGrounding,
      samples: 2,
      consumes: [],
      maxItems: 10,
      // Seeded from the parent's provenance critic, which has written 32,261
      // output tokens: a fifth above it, as the parent's own cap is.
      maxTokens: 40000,
    },
    {
      id: 'critic.generality',
      persona: criticGenerality,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 24000,
    },
    {
      id: 'critic.novelty',
      persona: criticNovelty,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 24000,
    },
  ],

  evaluators: [
    {
      id: 'evaluator.coverage',
      persona: evaluatorCoverage,
      samples: 2,
      consumes: [],
      maxTokens: 16000,
      criterionKinds: ['signal', 'transition', 'held'],
    },
    {
      id: 'evaluator.novelty',
      persona: evaluatorNovelty,
      samples: 2,
      consumes: [],
      maxTokens: 16000,
      criterionKinds: ['delta'],
    },
  ],

  policy: {
    version: '1',
    dimensionWeights: {
      coverage: 0.35,
      fidelity: 0.25,
      reuse: 0.2,
      novelty: 0.2,
    },
    criterionKinds: {
      signal: { dimension: 'coverage', weight: 1, gate: false },
      transition: { dimension: 'coverage', weight: 1, gate: false },
      held: { dimension: 'coverage', weight: 1, gate: false },
      delta: { dimension: 'novelty', weight: 1, gate: false },
    },
    // `fidelity` and `reuse` are priced by findings alone, as in the parent: a
    // digest nobody faulted renormalises them out. The pipeline's spec states
    // this as the declared exception and asserts that `coverage` and `novelty`
    // are earned by criteria.
    //
    // `withholds` is what a confirmed finding does to the items it names when
    // the store reads the digest (`withheldItems`), by what the fault says
    // rather than by how severe it is.
    //
    // **Every item it names** when storing the item would put something false
    // or misleading in the corpus: an insight its evidence does not say, a fact
    // that is not true with the design removed, an effect the record does not
    // show, a kind the evidence cannot support — the kind is what the store
    // indexes and what a later rule reads, so a mis-kinded item answers queries
    // it should never answer — an insight that holds only for this run, a
    // restatement of something already stored, and a claim about a known item
    // that its evidence does not bear on.
    //
    // **Nothing** when the item is merely written weakly. `vague_item` is the
    // whole of that case: the remedy is a rewrite, the knowledge is sound, and
    // dropping it loses a detail the corpus will not answer with again. In the
    // experience digest this type alone cost 51 of 245 narrow exclusions.
    //
    // **Nothing** for `duplicate_item` either, measured rather than reasoned.
    // Keeping all but one member of a named set was the declared rule on the strength of 42 of 43 recorded
    // duplicate findings naming two or more items — which establishes that the
    // rule has something to act on, and not that the named set contains only
    // the duplication. It does not: of the eight `duplicate_memory` findings in
    // ten recorded parent runs, three name three items, and in all three the
    // rationale identifies a pair and the third item is unrelated — a shared
    // store keyed by one identity beside two lessons about narration claims, a
    // p99 latency check beside two about a synchronous write. That rule
    // keeps one of the three, so it drops a bystander every time, and no rule
    // of this shape can avoid it: it cannot know which members of a named set
    // are the pair. A peer measured 18 of 75 (24%) on the same type over a
    // larger corpus.
    //
    // The asymmetry decides it. A dropped bystander is a distinct lesson lost
    // for good, since the run is not re-digested. A stored twin costs at most
    // one of sixteen fused recall slots, and the real defence against it is
    // reinforcement rather than this rule: an item whose evidence supports a
    // stored one is never stored again (`storable: false`). Storing a near-twin
    // is the recoverable failure; dropping a sound item is not.
    findingTypes: {
      misattributed_evidence: { dimension: 'fidelity', gate: true, withholds: 'every-ref' },
      ungrounded_fact: { dimension: 'fidelity', gate: true, withholds: 'every-ref' },
      unsupported_effect: { dimension: 'fidelity', gate: false, withholds: 'every-ref' },
      wrong_kind: { dimension: 'fidelity', gate: false, withholds: 'every-ref' },
      // Gated: an item that holds only for this run's names is the one failure a
      // later prompt cannot recover from, and pricing it cannot stop it being
      // stored — a digest penalised to the clamp still scores over the bar.
      run_specific: { dimension: 'reuse', gate: true, withholds: 'every-ref' },
      vague_item: { dimension: 'reuse', gate: false, withholds: 'none' },
      duplicate_item: { dimension: 'reuse', gate: false, withholds: 'none' },
      restated_known: { dimension: 'novelty', gate: false, withholds: 'every-ref' },
      false_confirmation: { dimension: 'novelty', gate: false, withholds: 'every-ref' },
      false_contradiction: { dimension: 'novelty', gate: false, withholds: 'every-ref' },
    },
    ...STANDARD_SCORING,
    // Two samples everywhere and two hits to confirm: the gated types need both
    // samples of a critic to agree before an item is withheld.
    // A lost sample scores and never gates, and one lost produce is asked
    // again — as the sibling digests declare.
    evidence: { minHits: 2, minAssessedShare: 0.75 },
    thresholds: { acceptAt: 75, rejectBelow: 30 },
    loop: { maxIterations: 2, plateauAfter: 2, concurrency: 2, lostProduces: 1 },
  },
};
