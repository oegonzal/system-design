import { z } from 'zod';

import { excerpt, listedOptionOf, quoted } from '../text';

/**
 * A question put to a person on whatever channels the notifications service
 * runs, and what became of it. The asker declares the ways to answer —
 * lettered choices, free text within a length, slash commands — and every
 * channel reads a reply with `readReply` alone, so "b" means the same on a
 * phone as at a terminal. An answer names its choice by id, never by its
 * letter or its label, so no channel's presentation leaks into what the asker
 * reads back.
 */

export const INTERACTION_TOPICS = {
  /** A prompt put to a person; anyone may publish it. */
  prompted: 'interaction.prompted',
  /** The answer a channel took; only the service publishes it. */
  answered: 'interaction.answered',
  /** A prompt its asker no longer waits on, or one the service let expire. */
  withdrawn: 'interaction.withdrawn',
} as const;

/** Where a prompt stands: waiting, answered, or withdrawn — before an answer, or after one its asker did not use. */
export const INTERACTION_STATES = ['open', 'answered', 'withdrawn'] as const;
export type InteractionState = (typeof INTERACTION_STATES)[number];

/** Why a prompt is withdrawn: another channel answered first, a newer prompt replaces it, its asker stopped waiting, or its time ran out. */
const WITHDRAWAL_REASONS = ['answered-elsewhere', 'superseded', 'abandoned', 'expired'] as const;

/** A command's id: what a person types after a slash, in the grammar chat apps give bot commands. */
const COMMAND_ID = /^[a-z][a-z0-9_]{0,31}$/;

/** The longest note a withdrawal carries. */
export const WITHDRAWAL_NOTE_MAX_LENGTH = 300;
const ID_MAX_LENGTH = 80;
const CHANNEL_MAX_LENGTH = 40;
/** A channel's id as an answer carries it (`via.channel`): what a policy over channels is keyed by. */
export const channelIdSchema = z.string().min(1).max(CHANNEL_MAX_LENGTH);

/** What a prompt may hold, for an asker to fit its question to: no part of a prompt is ever cut by the schema. */
export const PROMPT_LIMITS = {
  titleMaxLength: 500,
  detailMaxLength: 1_000,
  details: 12,
  /** A choice holds a page's option or a drafted answer whole. */
  choiceLabelMaxLength: 2_000,
  noteMaxLength: 300,
  /** A country list runs to about 250 options, and every one of them is a choice. */
  choices: 400,
  commands: 8,
  /** The longest answer a person may type, whatever the prompt allows. */
  answerMaxLength: 10_000,
} as const;
const ANSWER_TEXT_MAX_LENGTH = PROMPT_LIMITS.answerMaxLength;
const NOTE_MAX_LENGTH = PROMPT_LIMITS.noteMaxLength;

const choiceSchema = z.strictObject({
  id: z.string().min(1).max(ID_MAX_LENGTH),
  label: z.string().min(1).max(PROMPT_LIMITS.choiceLabelMaxLength),
  /** What a person should know about it: where it came from, why it was not trusted. */
  note: z.string().max(NOTE_MAX_LENGTH).nullable(),
});

const commandSchema = z.strictObject({
  id: z.string().regex(COMMAND_ID),
  label: z.string().min(1).max(NOTE_MAX_LENGTH),
});

const distinct = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;

export const interactionPromptSchema = z
  .strictObject({
    id: z.uuid(),
    /** Who asks, as the asker names itself, and the unit it asks for. */
    origin: z.strictObject({
      kind: z.string().min(1).max(CHANNEL_MAX_LENGTH),
      id: z.string().min(1).max(ID_MAX_LENGTH),
      label: z.string().max(NOTE_MAX_LENGTH),
    }),
    title: z.string().min(1).max(PROMPT_LIMITS.titleMaxLength),
    details: z.array(z.string().max(PROMPT_LIMITS.detailMaxLength)).max(PROMPT_LIMITS.details),
    /** Lettered in order by every channel: the first is `a`. */
    choices: z.array(choiceSchema).max(PROMPT_LIMITS.choices),
    /** Whether a person may type an answer of their own, and how long it may run; null when only a choice or a command answers. */
    freeText: z
      .strictObject({
        maxLength: z.number().int().positive().max(ANSWER_TEXT_MAX_LENGTH).nullable(),
      })
      .nullable(),
    commands: z.array(commandSchema).max(PROMPT_LIMITS.commands),
    /** When the service stops offering it, should its asker never withdraw it. */
    expiresAt: z.iso.datetime(),
  })
  .refine((prompt) => distinct(prompt.choices.map((choice) => choice.id)), {
    message: 'names a choice id twice',
    path: ['choices'],
  })
  .refine((prompt) => distinct(prompt.commands.map((command) => command.id)), {
    message: 'names a command twice',
    path: ['commands'],
  })
  .refine(
    (prompt) => prompt.choices.length > 0 || prompt.freeText !== null || prompt.commands.length > 0,
    { message: 'offers no way to answer' },
  );
export type InteractionPrompt = z.infer<typeof interactionPromptSchema>;

/** A reply as its asker reads it: a choice by id, words of the person's own, or a command. */
const interactionReplySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('choice'), choiceId: z.string().min(1).max(ID_MAX_LENGTH) }),
  z.strictObject({ kind: z.literal('text'), text: z.string().min(1).max(ANSWER_TEXT_MAX_LENGTH) }),
  z.strictObject({ kind: z.literal('command'), commandId: z.string().regex(COMMAND_ID) }),
]);
type InteractionReply = z.infer<typeof interactionReplySchema>;

export const interactionAnswerSchema = z.strictObject({
  promptId: z.uuid(),
  reply: interactionReplySchema,
  /** The channel it was given on, and that channel's reference for the message that gave it. */
  via: z.strictObject({
    channel: channelIdSchema,
    ref: z.string().min(1).max(ID_MAX_LENGTH),
  }),
});
export type InteractionAnswer = z.infer<typeof interactionAnswerSchema>;

export const interactionWithdrawnSchema = z.strictObject({
  promptId: z.uuid(),
  reason: z.enum(WITHDRAWAL_REASONS),
  /** What a person watching the prompt close should read — "answered at the terminal: Yes". */
  note: z.string().max(WITHDRAWAL_NOTE_MAX_LENGTH).nullable(),
});
export type InteractionWithdrawn = z.infer<typeof interactionWithdrawnSchema>;

/** How a prompt closed: the answer a channel took, or a withdrawal — the last word on whether an answer was used. */
export type InteractionOutcome =
  | { kind: 'answered'; answer: InteractionAnswer }
  | { kind: 'withdrawn'; withdrawal: InteractionWithdrawn };

/** The key a choice is answered by, from its place in the list: a…z, then aa, ab… */
export function choiceKey(index: number): string {
  let key = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    key = String.fromCharCode(97 + ((n - 1) % 26)) + key;
  }
  return key;
}

/** The keys a prompt's choices take, as one short phrase. */
const keysOf = (prompt: InteractionPrompt): string => {
  const count = prompt.choices.length;
  return count <= 4
    ? prompt.choices.map((_, index) => choiceKey(index)).join(', ')
    : `${choiceKey(0)}–${choiceKey(count - 1)}`;
};

/** How a prompt may be answered, as one line every channel shows. */
export function howToAnswer(prompt: InteractionPrompt): string {
  const ways: string[] = [];
  // A choice is taken by its words as well as its letter; where no own answer
  // is taken, saying so answers a long list without hunting for the letter.
  // Measured 2026-10-11: picking a country out of 250 lettered lines took 73 s.
  if (prompt.choices.length > 0) {
    ways.push(
      prompt.freeText === null
        ? `a letter (${keysOf(prompt)}) or the option as written`
        : `a letter (${keysOf(prompt)})`,
    );
  }
  if (prompt.freeText !== null) {
    ways.push(
      prompt.freeText.maxLength === null
        ? 'your own answer'
        : `your own answer (at most ${prompt.freeText.maxLength} characters)`,
    );
  }
  if (prompt.commands.length > 0) {
    ways.push(prompt.commands.map((command) => `/${command.id}`).join(', '));
  }
  return `Reply with ${ways.join(', or ')}.`;
}

/** What a typed reply means against a prompt, or why it means nothing there. */
type ReplyReading =
  { kind: 'reply'; reply: InteractionReply } | { kind: 'refused'; reason: string };

const refused = (prompt: InteractionPrompt, why: string): ReplyReading => ({
  kind: 'refused',
  reason: `${why} ${howToAnswer(prompt)}`,
});

const chosen = (choiceId: string): ReplyReading => ({
  kind: 'reply',
  reply: { kind: 'choice', choiceId },
});

/**
 * What one typed reply means, read the same way on every channel: a declared
 * command by its slash; a choice by its key, case aside; a choice by its label
 * as `listedOptionOf` names one — the label itself, else the one equal to it
 * but for case; then the person's own words where the prompt takes them,
 * within their length. Anything else is refused with how the prompt is
 * answered, and the prompt stays open.
 */
export function readReply(prompt: InteractionPrompt, typed: string): ReplyReading {
  const text = typed.trim();
  if (text === '') return refused(prompt, 'Nothing was typed.');
  if (text.startsWith('/')) {
    const command = prompt.commands.find((candidate) => `/${candidate.id}` === text.toLowerCase());
    return command === undefined
      ? refused(prompt, `${text} is not a command here.`)
      : { kind: 'reply', reply: { kind: 'command', commandId: command.id } };
  }
  const keyed = prompt.choices.find((_, index) => choiceKey(index) === text.toLowerCase());
  if (keyed !== undefined) return chosen(keyed.id);
  const label = listedOptionOf(
    prompt.choices.map((choice) => choice.label),
    text,
  );
  const labelled = prompt.choices.find((choice) => choice.label === label);
  if (labelled !== undefined) return chosen(labelled.id);
  if (prompt.freeText !== null) {
    const max = prompt.freeText.maxLength ?? ANSWER_TEXT_MAX_LENGTH;
    return text.length > max
      ? refused(prompt, `That is ${text.length} characters, and at most ${max} fit.`)
      : { kind: 'reply', reply: { kind: 'text', text } };
  }
  return refused(prompt, `${quoted(excerpt(text, 60))} is none of the choices.`);
}

/** A reply in a few words against its prompt — "b: Female", "/blank (Leave it empty)" — for whoever watches it close. */
export function describeReply(prompt: InteractionPrompt, reply: InteractionReply): string {
  switch (reply.kind) {
    case 'choice': {
      const index = prompt.choices.findIndex((choice) => choice.id === reply.choiceId);
      const choice = prompt.choices[index];
      return choice === undefined
        ? reply.choiceId
        : `${choiceKey(index)}: ${excerpt(choice.label, 120)}`;
    }
    case 'text':
      return quoted(excerpt(reply.text, 120));
    case 'command': {
      const command = prompt.commands.find((candidate) => candidate.id === reply.commandId);
      return command === undefined ? `/${reply.commandId}` : `/${command.id} (${command.label})`;
    }
  }
}
