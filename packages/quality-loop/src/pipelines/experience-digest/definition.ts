/**
 * The third pipeline: judge what a finished run of any pipeline taught, and
 * distil it into memories worth keeping. Everything here is data —
 * vocabularies, md personas, samples and the policy — except the digest's
 * `OutputShape`, the record codec and composer beside it, and two exact
 * validators.
 */
import type { PipelineDefinition } from '../../core/pipeline';
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
    output: experienceDigestOutput,
  },

  deriveCriteria: { persona: deriveCriteria, maxTokens: 2500 },
  producer: { persona: producer, maxTokens: 4000 },
  validators: [referencesValidator, limitsValidator],

  critics: [
    {
      id: 'critic.attribution',
      persona: criticAttribution,
      samples: 2,
      maxItems: 10,
      maxTokens: 4000,
    },
    {
      id: 'critic.provenance',
      persona: criticProvenance,
      samples: 2,
      maxItems: 10,
      maxTokens: 4000,
    },
    {
      id: 'critic.transfer',
      persona: criticTransfer,
      samples: 2,
      maxItems: 10,
      maxTokens: 4000 
    },
  ],

  evaluators: [
    {
      id: 'evaluator.attribution',
      persona: evaluatorAttribution,
      samples: 2,
      maxItems: MAX_CRITERIA,
      maxTokens: 2500,
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
    findingTypes: {
      missed_signal: {
        dimension: 'attribution',
        gate: false,
      },
      unsupported_effect: {
        dimension: 'attribution',
        gate: false,
      },
      misattributed_evidence: {
        dimension: 'fidelity',
        gate: true,
      },
      // Gated, unlike its two neighbours in `reuse`: a memory that holds only
      // for this run's names and numbers is the one failure a later prompt
      // cannot recover from, and pricing it cannot stop it being stored — a
      // digest with `reuse` penalised to the cap still scores 82, over the
      // bar. Vagueness and duplication cost a reader little and stay priced.
      run_specific: {
        dimension: 'reuse',
        gate: true,
      },
      vague_insight: {
        dimension: 'reuse',
        gate: false,
      },
      duplicate_memory: {
        dimension: 'reuse',
        gate: false,
      },
    },
    resultValues: {
      pass: 1,
      partial: 0.5,
      fail: 0,
    },
    confidenceWeights: {
      none: 0,
      low: 0.33,
      medium: 0.67,
      high: 1,
    },
    penalties: {
      bySeverity: {
        critical: 40,
        high: 25,
        medium: 12,
        low: 5,
        info: 0,
      },
      decay: 0.7,
      maxPerDimension: 60,
    },
    blockingSeverities: ['critical'],
    // Two samples everywhere and two hits to confirm: the gated
    // `misattributed_evidence` needs both samples of a critic to agree.
    evidence: { minHits: 2, minAssessedShare: 0.75 },
    thresholds: { acceptAt: 75, rejectBelow: 30 },
    loop: { maxIterations: 2, plateauAfter: 2, concurrency: 2 },
  },
};
