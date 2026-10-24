/**
 * Builders the introduction-note specs share. Pure helpers only — no vitest
 * imports — so the file compiles under the app tsconfig. The goal is shaped
 * as a composer writes one: the reader, the program's record, the sender's
 * facts, the offers with ids, the ask, and the index the validators read.
 */
import {
  INTRODUCTION_NOTE_PIPELINE_ID,
  renderIndexSection,
  type IntroductionIndex,
  type IntroductionNoteOutput,
} from '@sysdesign/contracts';

export const sampleIndex = (): IntroductionIndex => ({
  pipeline: INTRODUCTION_NOTE_PIPELINE_ID,
  piid: '47QFCA22F0018',
  offerIds: ['offer.1', 'offer.2', 'offer.3'],
});

export const sampleIntroductionGoal = (index: IntroductionIndex = sampleIndex()): string =>
  [
    '# Introduce Precision Software LLC to GENERAL DYNAMICS INFORMATION TECHNOLOGY, INC. about 47QFCA22F0018',
    '',
    '## Reader',
    '',
    'Jane Doe, small business liaison officer at GENERAL DYNAMICS INFORMATION TECHNOLOGY, INC.',
    '',
    '## Program',
    '',
    '- Contract number: 47QFCA22F0018',
    '- Buyer: General Services Administration.Federal Acquisition Service.GSA FAS AAS FEDSIM',
    '- Type: DELIVERY ORDER under 47QTCK18D0003',
    '- Runs: 2022-04-04 to 2027-04-03, with options to 2029-04-03',
    '- Funded: $465.3M obligated of $751.6M',
    '- Subcontracting plan: F INDIVIDUAL SUBCONTRACT PLAN',
    '- Subcontracts reported: 261',
    '- Description: MANAGED APPLICATION, INFRASTRUCTURE, NETWORKING, END USER AND CYBERSECURITY SERVICES',
    '',
    '## Sender',
    '',
    'Precision Software LLC builds agentic AI workflows and integrations for enterprise systems.',
    'Remote delivery by a U.S.-citizen principal; unclassified work; travel available.',
    'Reach the sender at: teaming@precision-software.example',
    '',
    '## Offers',
    '',
    '[offer.1] Agentic workflow engineering — agents that carry a business process end to end under human approval.',
    '[offer.2] Document intelligence and retrieval — pipelines that read, index and answer from large document sets.',
    '[offer.3] AI-assisted QA — automated regression suites and browser automation for web applications.',
    '',
    '## Ask',
    '',
    'Ask whether the program needs additional small-business engineering capacity, and for an introduction to its program manager. The capability statement is attached.',
    '',
    renderIndexSection(index),
  ].join('\n');

export const sampleNote = (
  overrides: Partial<IntroductionNoteOutput> = {},
): IntroductionNoteOutput => ({
  subject: 'Small-business engineering capacity for 47QFCA22F0018',
  opening:
    'I lead Precision Software LLC, a small software firm, and I am writing about the GSA FEDSIM order 47QFCA22F0018 for managed application and infrastructure services.',
  programReference: { piid: '47QFCA22F0018' },
  offerLines: [
    {
      offerId: 'offer.1',
      line: 'We build agentic workflows that carry application-support processes end to end under human approval.',
    },
    {
      offerId: 'offer.3',
      line: 'We stand up automated regression and browser test suites for the applications the order manages.',
    },
  ],
  ask: 'Does the program need additional small-business engineering capacity, and could you introduce me to its program manager?',
  closing:
    'Our capability statement is attached; reach me at teaming@precision-software.example. I deliver remotely as a U.S.-citizen principal on unclassified work.',
  ...overrides,
});

/** The sample with a claim the goal never made — what the claims critic exists to catch. */
export const overreachingNote = (): IntroductionNoteOutput =>
  sampleNote({
    opening:
      'I lead Precision Software LLC, which delivered the same work for the Navy at half the price, and I am writing about 47QFCA22F0018.',
  });
