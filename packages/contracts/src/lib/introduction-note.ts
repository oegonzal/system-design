import { z } from 'zod';

import { bound, bounded } from './bounds';
import type { SuccessCriterion } from './quality-loop/evidence';

/**
 * An introduction note: a short message from one firm to a named reader at
 * another firm about one named program, asking for a small piece of its
 * work. The quality loop's `introduction-note` pipeline writes it from a goal
 * another program composes — the reader, the program as its record states
 * it, the sender's own facts, the offers the sender makes with an id each,
 * and the one ask — and the composer reads the artifact back through the
 * schema declared here, then prints it as the note a person sends.
 */
export const INTRODUCTION_NOTE_PIPELINE_ID = 'introduction-note';

/** Two iterations: one note, and one revision when the judges found it wanting. */
export const INTRODUCTION_NOTE_ITERATIONS = 2;

/**
 * The four rules every note is judged on, declared once: the pipeline fixes
 * them on every rubric it derives, and the composer supplies them as the
 * rubric of every run it starts, so no run pays for a derivation and both
 * read one declaration.
 */
export const INTRODUCTION_NOTE_RULES = [
  {
    kind: 'fidelity',
    statement:
      'Every claim about the sender comes from a listed offer or the sender’s own facts, and every claim about the program from its record; nothing is invented.',
  },
  {
    kind: 'relevance',
    statement:
      'The note names the program by its contract number and buyer, and each offer it makes connects to what the program’s description says the work is.',
  },
  {
    kind: 'restraint',
    statement:
      'The note states no price, no résumé, no past performance the record does not state and no flattery, and asks one thing of the reader.',
  },
  {
    kind: 'clarity',
    statement:
      'Each part reads in one breath — why the sender writes, the offers, the ask, the close — in plain words a busy reader can act on.',
  },
] as const;

/** The rules as a supplied rubric, ids positional as the pipeline would assign them. */
export const introductionNoteRubric = (): SuccessCriterion[] =>
  INTRODUCTION_NOTE_RULES.map((rule, index) => ({ id: `c${index + 1}`, ...rule }));

export const INTRODUCTION_SUBJECT_BOUND = bound(120);
export const INTRODUCTION_PART_BOUND = bound(500);
export const INTRODUCTION_OFFER_LINE_BOUND = bound(300);
export const INTRODUCTION_OFFERS_BOUND = bound(3, 'list');
/** `offer.N` — short by construction. */
export const OFFER_ID_MAX_LENGTH = 16;
/** A contract number as the award sources spell one. */
export const PIID_MAX_LENGTH = 80;

export const introductionOfferLineSchema = z.strictObject({
  offerId: bounded.id(OFFER_ID_MAX_LENGTH, {
    min: 1,
    description: 'The listed offer this line makes: offer.N, exactly as indexed.',
  }),
  line: bounded.text(INTRODUCTION_OFFER_LINE_BOUND, {
    min: 1,
    description:
      'One sentence connecting that offer to what the program’s description says the work is.',
  }),
});

export const introductionNoteOutputSchema = z.strictObject({
  subject: bounded.text(INTRODUCTION_SUBJECT_BOUND, {
    min: 1,
    description: 'The subject line, naming the program.',
  }),
  opening: bounded.text(INTRODUCTION_PART_BOUND, {
    min: 1,
    description:
      'Who writes and why, in one or two sentences, naming the program by its contract number and its buyer.',
  }),
  programReference: z.strictObject({
    piid: bounded.id(PIID_MAX_LENGTH, {
      min: 1,
      description: 'The program’s contract number exactly as the goal states it.',
    }),
  }),
  offerLines: bounded.list(INTRODUCTION_OFFERS_BOUND, introductionOfferLineSchema, {
    description: 'One to three offers from the indexed list, each tied to the program.',
  }),
  ask: bounded.text(INTRODUCTION_PART_BOUND, {
    min: 1,
    description: 'The one thing asked of the reader, as the goal’s ask states it.',
  }),
  closing: bounded.text(INTRODUCTION_PART_BOUND, {
    min: 1,
    description:
      'How the note ends: the attached capability statement named, and how to reach the sender, from the sender’s facts.',
  }),
});
export type IntroductionNoteOutput = z.infer<typeof introductionNoteOutputSchema>;

/**
 * The index a note's composer writes under the goal and the pipeline's
 * validator reads: the program the note must name and the offers it may
 * make. Declared data, never a reading of prose.
 */
export const introductionIndexSchema = z.strictObject({
  pipeline: z.literal(INTRODUCTION_NOTE_PIPELINE_ID),
  piid: z.string(),
  offerIds: z.array(z.string()),
});
export type IntroductionIndex = z.infer<typeof introductionIndexSchema>;

/** The note as one text a person sends, printed the same by every program that shows it. */
export interface RenderedIntroduction {
  subject: string;
  body: string;
}

export function renderIntroduction(
  note: IntroductionNoteOutput,
  reader: string,
): RenderedIntroduction {
  const offers = note.offerLines.map((offer) => `- ${offer.line}`);
  return {
    subject: note.subject,
    body: [`Dear ${reader},`, '', note.opening, '', ...offers, '', note.ask, '', note.closing].join(
      '\n',
    ),
  };
}
