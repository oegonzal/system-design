/**
 * The document digest: one chunk of a document about a person — a résumé
 * page, a notes file, the operator's answers from one session — judged for
 * what it states about its subject, and distilled into facts in the store's
 * own item shape. Everything here is data — vocabularies, md personas,
 * samples and the policy — except the digest's `OutputShape`, the index
 * reader beside it and two exact validators.
 *
 * Two samples everywhere and two hits to confirm, as the experience digest
 * runs: the three gated findings — a fact the sections never stated, a
 * section read as saying what it does not, a fact scoped where it does not
 * hold — must be agreed by both samples of a critic before they withhold a
 * memory from the store.
 */
import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import { DOCUMENT_DIGEST_ID, MAX_CRITERIA, STATEMENT_BOUND } from './input';
import criticCoverage from './lenses/critic.coverage.md?raw';
import criticGrounding from './lenses/critic.grounding.md?raw';
import criticUsability from './lenses/critic.usability.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorCapture from './lenses/evaluator.capture.md?raw';
import evaluatorRules from './lenses/evaluator.rules.md?raw';
import producer from './lenses/producer.md?raw';
import { documentDigestOutput, type DocumentDigest } from './output';
import { limitsValidator, referencesValidator } from './validators';

export const DOCUMENT_DIGEST: PipelineDefinition<DocumentDigest> = {
  id: DOCUMENT_DIGEST_ID,
  version: '1.0.0',

  // A goal another program composes; never a route, a target, or a choice in the UI.
  goalSource: 'composed',
  description:
    'One chunk of a document about a person, judged for the facts it states about its subject and for the rules a stored fact must obey, and distilled into facts a form could be answered from.',

  task: {
    criterionKinds: {
      fact: 'A fact the sections state about the subject that a form could ask for — a role with its employer and dates, a figure of experience, a degree, a location, a right to work, an answer the subject gave — that the digest must capture.',
      rule: 'A rule the goal states about how a memory may be written: kinded for what it is — a fact, a story kept whole, or a boundary on what may be claimed — scoped for whether it holds of the subject wherever asked or only of the situation it was recorded in, resting only on its cited sections, complete with absolute dates and figures, a dated role’s tenure computed from its dates alone, named for the form situation that calls for it, and carrying any qualifier its cited sections put on the claim.',
    },
    findingTypes: {
      invented_fact: 'An insight that states something no cited section states.',
      misread_section: 'An insight that reads a cited section as saying something it does not.',
      misscoped_fact:
        'A memory scoped subject whose question asks about the situation it was recorded in — the employer, the role, this application — or scoped unit when its question asks about the subject wherever asked.',
      missed_fact: 'A fact a form could ask for that the sections state and no memory holds.',
      unusable_fact:
        'An insight a form field could not take or compute from as written: a relative date, a pronoun for the subject, a figure without its unit.',
      vague_condition:
        'An appliesWhen that does not name the form situation calling for the fact, so no field’s label would find it.',
      provenance_leak:
        'An insight or an appliesWhen on a memory scoped subject that carries where or when the fact was recorded — the unit of work, the employer applied to, the day, the page.',
      duplicate_fact: 'Two memories stating the same fact about the subject.',
    },
    maxCriteria: MAX_CRITERIA,
    statementBound: STATEMENT_BOUND,
    output: documentDigestOutput,
  },

  // Caps seeded from the experience digest's measured table — the pipeline
  // with the same lens shape and item shape over goals of the same size —
  // and re-pinned once the first live document runs are recorded. A cap is
  // also the call's time limit (`callTimeLimitMs`), so one a stage
  // outwrites is a call cut short.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 8000 },
  producer: { persona: producer, maxTokens: 32000, consumes: ['criteria'] },
  validators: [referencesValidator, limitsValidator],
  controller: STANDARD,

  critics: [
    {
      id: 'critic.grounding',
      persona: criticGrounding,
      samples: 2,
      maxItems: 10,
      maxTokens: 32000,
    },
    {
      id: 'critic.coverage',
      persona: criticCoverage,
      samples: 2,
      maxItems: 10,
      maxTokens: 32000,
    },
    {
      id: 'critic.usability',
      persona: criticUsability,
      samples: 2,
      maxItems: 10,
      maxTokens: 24000,
    },
  ],

  evaluators: [
    {
      id: 'evaluator.capture',
      persona: evaluatorCapture,
      samples: 2,
      consumes: [],
      maxTokens: 16000,
      criterionKinds: ['fact'],
    },
    {
      id: 'evaluator.rules',
      persona: evaluatorRules,
      samples: 2,
      consumes: [],
      maxTokens: 16000,
      criterionKinds: ['rule'],
    },
  ],

  policy: {
    version: '1',
    dimensionWeights: { coverage: 0.5, fidelity: 0.5 },
    criterionKinds: {
      fact: { dimension: 'coverage', weight: 1, gate: false },
      // A broken rule is never offset by coverage: the store would hold the breach.
      rule: { dimension: 'fidelity', weight: 1, gate: true },
    },
    // The three defects that would store a falsehood about a person gate;
    // what a memory fails to hold, or holds awkwardly, is priced.
    //
    // `withholds` is what a confirmed finding does to the memories it names
    // when the store reads the digest (`withheldItems`), by what the finding
    // says about the fact rather than by how loudly it says it. A fact the
    // sections never stated, a section read as saying what it does not, or a
    // fact scoped where it does not hold — one application's answer asserted
    // of the subject everywhere — is wrong: storing it would have the corpus
    // assert something about the subject that their own documents do not, so
    // every memory such a finding names is withheld. The remaining types fault
    // a fact that is true, and withhold nothing — a provenance leak among
    // them: the fact holds, only its wording keeps a reworded question from
    // finding it, and a revise fixes wording where a loss fixes nothing. A duplicate's confirmed set is a component of
    // overlapping claims, not one pair, so keeping one of it may drop a
    // bystander (`WITHHOLDINGS` says why). A fact a form could not
    // use as written, a condition that restates its insight, and a fact no
    // memory captured all say the writing is weak, not that the fact is false —
    // and a true fact dropped for its phrasing is a detail the corpus can never
    // answer with again, which for a record of someone's career is the worse
    // loss. Measured on the first live chunk: three of eight true facts were
    // withheld, two of them for using "him" where the subject's name belonged.
    findingTypes: {
      invented_fact: { dimension: 'fidelity', gate: true, withholds: 'every-ref' },
      misread_section: { dimension: 'fidelity', gate: true, withholds: 'every-ref' },
      misscoped_fact: { dimension: 'fidelity', gate: true, withholds: 'every-ref' },
      missed_fact: { dimension: 'coverage', gate: false, withholds: 'none' },
      unusable_fact: { dimension: 'coverage', gate: false, withholds: 'none' },
      vague_condition: { dimension: 'coverage', gate: false, withholds: 'none' },
      provenance_leak: { dimension: 'coverage', gate: false, withholds: 'none' },
      duplicate_fact: { dimension: 'coverage', gate: false, withholds: 'none' },
    },
    ...STANDARD_SCORING,
    evidence: { minHits: 2, minAssessedShare: 0.75 },
    thresholds: { acceptAt: 75, rejectBelow: 30 },
    loop: { maxIterations: 2, plateauAfter: 2, concurrency: 2, lostProduces: 1 },
  },
};
