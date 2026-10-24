import {
  INTRODUCTION_NOTE_PIPELINE_ID,
  money,
  renderIndexSection,
  withinBudget,
  type AwardBody,
  type IntroductionIndex,
  type IntroductionPolicy,
  type TargetContactRole,
} from '@sysdesign/contracts';

import type { TargetRecord } from '../ports';

/**
 * The goal an introduction-note run is written from, composed from declared
 * data and nothing else: the target as the person keeps it, the award's
 * record as the source states it, and the profile's own words about the
 * company and what it offers. The offers are indexed `offer.N` by position,
 * and the index the validators read closes the goal. Pure.
 */
export interface IntroductionBrief {
  company: string;
  introduction: IntroductionPolicy;
  target: Pick<TargetRecord, 'kind' | 'label' | 'contacts'>;
  award: AwardBody;
}

/** How a contact's declared role is said in a note's address. */
const ROLE_PHRASE: Record<TargetContactRole, string> = {
  sblo: 'small business liaison officer',
  'supplier-manager': 'supplier manager',
  'program-manager': 'program manager',
  'capture-manager': 'capture manager',
  other: 'contact',
};

/** The one thing every introduction asks, in the sender's voice. */
export const INTRODUCTION_ASK =
  'Ask one thing of the reader: an introduction to the program’s manager. The capability statement is attached.';

/** The positional id the goal gives the profile's offer at `position`. */
export const offerIdAt = (position: number): string => `offer.${position + 1}`;

/** The firm the note is addressed to: the award's holder, which a firm target names too. */
const firmOf = (brief: IntroductionBrief): string =>
  brief.target.kind === 'firm' ? brief.target.label : brief.award.recipient.name;

/** Who the note addresses: the target's first contact in their role, or the firm's small-business liaison team. */
export const introductionReaderOf = (
  target: Pick<TargetRecord, 'kind' | 'label' | 'contacts'>,
  award: Pick<AwardBody, 'recipient'>,
): string => {
  const firm = target.kind === 'firm' ? target.label : award.recipient.name;
  const [first] = target.contacts;
  return first === undefined
    ? `the small business liaison team at ${firm}`
    : `${first.name}, ${ROLE_PHRASE[first.role]} at ${firm}`;
};

export const introductionIndexOf = (brief: IntroductionBrief): IntroductionIndex => ({
  pipeline: INTRODUCTION_NOTE_PIPELINE_ID,
  piid: brief.award.piid ?? brief.award.externalId,
  offerIds: brief.introduction.offers.map((_, position) => offerIdAt(position)),
});

const dated = (from: string | null, to: string | null, options: string | null): string => {
  const span = `${from ?? '?'} to ${to ?? '?'}`;
  return options === null || options === to ? span : `${span}, with options to ${options}`;
};

const programLines = (award: AwardBody): string[] => [
  `- Contract number: ${award.piid ?? award.externalId}`,
  `- Buyer: ${award.agencyPath ?? 'not named'}`,
  `- Type: ${award.typeDescription ?? 'not stated'}${award.vehicle?.piid ? ` under ${award.vehicle.piid}` : ''}`,
  `- Runs: ${dated(award.startsAt, award.endsAt, award.endsWithOptionsAt)}`,
  `- Funded: ${money(award.obligated)} obligated of ${money(award.ceiling)}`,
  `- Subcontracting plan: ${award.subcontractingPlan === null ? 'none stated' : `${award.subcontractingPlan.code} ${award.subcontractingPlan.description ?? ''}`.trim()}`,
  `- Subcontracts reported: ${award.subcontractCount}`,
  `- Description: ${award.description ?? 'not stated'}`,
];

/** The goal, under the engine's budget; throws `GoalBudgetExceeded` past it. */
export function composeIntroductionGoal(brief: IntroductionBrief): string {
  const { introduction } = brief;
  const piid = brief.award.piid ?? brief.award.externalId;
  return withinBudget(
    [
      `# Introduce ${brief.company} to ${firmOf(brief)} about ${piid}`,
      '',
      '## Reader',
      '',
      introductionReaderOf(brief.target, brief.award),
      '',
      '## Program',
      '',
      ...programLines(brief.award),
      '',
      '## Sender',
      '',
      `${brief.company}: ${introduction.about}`,
      introduction.delivery,
      `Reach the sender at: ${introduction.contact.length > 0 ? introduction.contact : 'the address in the attached capability statement'}`,
      '',
      '## Offers',
      '',
      ...introduction.offers.map(
        (offer, position) => `[${offerIdAt(position)}] ${offer.label} — ${offer.line}`,
      ),
      '',
      '## Ask',
      '',
      INTRODUCTION_ASK,
      '',
      renderIndexSection(introductionIndexOf(brief)),
    ].join('\n'),
  );
}
