/**
 * An introduction note as an artifact: its parts, each a line a lens can cite
 * — the subject, the opening, the program it names, each offer as `offer.N`
 * with the listed offer it makes printed beside it, the ask and the close.
 */
import {
  introductionNoteOutputSchema,
  type ArtifactLocation,
  type IntroductionNoteOutput,
} from '@sysdesign/contracts';

import { numbered, type OutputShape } from '../../core/contracts';

export const introductionNoteOutput: OutputShape<IntroductionNoteOutput> = {
  schema: introductionNoteOutputSchema,

  locate: (note): ArtifactLocation[] => [
    { id: 'subject', label: 'the subject line' },
    { id: 'opening', label: 'why the sender writes' },
    { id: 'program', label: `the program named: ${note.programReference.piid}` },
    ...numbered('offer', note.offerLines, (offer) => `the offer ${offer.offerId}`),
    { id: 'ask', label: 'the ask' },
    { id: 'closing', label: 'the close' },
  ],

  render: (note) =>
    [
      `[subject] ${note.subject}`,
      `[opening] ${note.opening}`,
      `[program] ${note.programReference.piid}`,
      ...note.offerLines.map(
        (offer, index) => `[offer.${index + 1}] (${offer.offerId}) ${offer.line}`,
      ),
      `[ask] ${note.ask}`,
      `[closing] ${note.closing}`,
    ].join('\n'),
};
