import { randomUUID } from 'node:crypto';

import {
  closedOptionsOf,
  excerpt,
  PROMPT_LIMITS,
  quoted,
  type FieldSpec,
  type InteractionAnswer,
  type InteractionPrompt,
} from '@sysdesign/contracts';

import { fieldTypeOf } from './field-routing';
import type { OperatorQuestion } from './ports';

/**
 * A field put to the operator, the one way every channel shows it, and the
 * answer read back as what the session does with the field. The question is
 * the notifications contracts' prompt: the field's options as lettered
 * choices — or, for a field with none, the answerer's untrusted value as one —
 * free text where the field takes it, and the commands a person may give
 * instead of an answer. Each choice's full value is kept by its id, so what is
 * filled is never a label shortened to fit.
 */

/** The commands a field question offers, by the ids a person types after a slash. */
const FIELD_COMMANDS = {
  readback: { label: 'I filled it in the browser: read it back', reply: { kind: 'read-back' } },
  blank: { label: 'Leave it empty', reply: { kind: 'blank' } },
  stop: { label: 'End the session', reply: { kind: 'stop' } },
} as const satisfies Record<string, { label: string; reply: OperatorReply }>;

/** What an empty line at the terminal means for a field: read back what was typed into the page. */
const FIELD_ENTER = 'readback';

/** The operator's reply to a field, as the session acts on it. */
export type OperatorReply =
  { kind: 'answer'; text: string } | { kind: 'read-back' } | { kind: 'blank' } | { kind: 'stop' };

/** Where a filled answer came from: a listed option, the answerer's untrusted value, or the person's own words. */
export type AnswerSource = 'option' | 'answerer' | 'typed';

/** A field that needs a person, and everything the person should see beside it. */
export interface OperatorPrompt {
  field: FieldSpec;
  /** The answerer's value, offered for the operator to accept or replace; null when it gave none. */
  untrusted: string | null;
  /** Why it was not trusted: the route's reason and what a judge or validator said. */
  why: string;
  task: string | null;
  page: string;
}

/** Who asks, as every channel names it, and until when a channel keeps offering the question. */
export interface Asking {
  origin: InteractionPrompt['origin'];
  expiresAt: Date;
}

/** A field question as put, and the full value behind each of its choices. */
export interface AskedField {
  question: OperatorQuestion;
  values: ReadonlyMap<string, { value: string; source: AnswerSource }>;
}

const note = (text: string): string => excerpt(text, PROMPT_LIMITS.noteMaxLength);
const detail = (text: string): string => excerpt(text, PROMPT_LIMITS.detailMaxLength);

/** What the field asks, as a title: its name, else the words around it. */
const titleOf = (field: FieldSpec): string =>
  excerpt(
    field.name !== '' ? field.name : (field.context ?? 'A field on the page'),
    PROMPT_LIMITS.titleMaxLength,
  );

export function fieldQuestion(prompt: OperatorPrompt, asking: Asking): AskedField {
  const { field } = prompt;
  const choices: InteractionPrompt['choices'] = [];
  const values = new Map<string, { value: string; source: AnswerSource }>();
  const choose = (value: string, source: AnswerSource, why: string | null): void => {
    const id = `c${choices.length + 1}`;
    choices.push({ id, label: excerpt(value, PROMPT_LIMITS.choiceLabelMaxLength), note: why });
    values.set(id, { value, source });
  };
  if (field.options !== null) {
    for (const option of field.options.slice(0, PROMPT_LIMITS.choices)) {
      choose(
        option,
        'option',
        option === prompt.untrusted
          ? note(`the answerer's pick — not trusted: ${prompt.why}`)
          : null,
      );
    }
  } else if (prompt.untrusted !== null) {
    choose(prompt.untrusted, 'answerer', note(`the answerer's value — not trusted: ${prompt.why}`));
  }
  const title = titleOf(field);
  const facts = [
    fieldTypeOf(field),
    ...(field.required ? ['required'] : []),
    ...(field.maxLength === null ? [] : [`at most ${field.maxLength} characters`]),
  ];
  const details = [
    facts.join(', '),
    ...(field.context !== null && field.context !== title ? [field.context] : []),
    ...(field.optionsOmitted > 0
      ? [`${field.optionsOmitted} more options are not listed: type the one you mean`]
      : []),
    `Page: ${prompt.page}`,
    ...(prompt.task === null ? [] : [`Unit of work: ${prompt.task}`]),
    prompt.untrusted === null
      ? `No suggested value — ${prompt.why}`
      : `Suggested: ${quoted(prompt.untrusted)} — not trusted: ${prompt.why}`,
  ].map(detail);
  return {
    question: {
      prompt: {
        id: randomUUID(),
        origin: asking.origin,
        title,
        details,
        choices,
        // A closed list is answered by its options alone; any other field takes the person's words.
        freeText:
          closedOptionsOf(field) === null
            ? {
                maxLength:
                  field.maxLength === null
                    ? null
                    : Math.min(field.maxLength, PROMPT_LIMITS.answerMaxLength),
              }
            : null,
        commands: Object.entries(FIELD_COMMANDS).map(([id, command]) => ({
          id,
          label: command.label,
        })),
        expiresAt: asking.expiresAt.toISOString(),
      },
      enter: FIELD_ENTER,
    },
    values,
  };
}

/** The answer as what the session does with the field: the full value behind a choice, the words typed, or a command. */
export function fieldReplyOf(
  asked: AskedField,
  answer: InteractionAnswer,
): { reply: OperatorReply; chosen: AnswerSource | null } {
  const { reply } = answer;
  switch (reply.kind) {
    case 'choice': {
      const chosen = asked.values.get(reply.choiceId);
      if (chosen === undefined) {
        throw new Error(
          `the answer names choice ${reply.choiceId}, which the question never offered`,
        );
      }
      return { reply: { kind: 'answer', text: chosen.value }, chosen: chosen.source };
    }
    case 'text':
      return { reply: { kind: 'answer', text: reply.text }, chosen: 'typed' };
    case 'command': {
      const command = Object.entries(FIELD_COMMANDS).find(([id]) => id === reply.commandId);
      if (command === undefined) {
        throw new Error(
          `the answer gives command /${reply.commandId}, which the question never offered`,
        );
      }
      return { reply: command[1].reply, chosen: null };
    }
  }
}

/** Something the operator must do before the session goes on, answered by going on. */
export function pauseQuestion(text: string, asking: Asking): OperatorQuestion {
  return {
    prompt: {
      id: randomUUID(),
      origin: asking.origin,
      title: 'The session is waiting for you',
      details: [detail(text)],
      choices: [],
      freeText: null,
      commands: [{ id: 'continue', label: 'Continue' }],
      expiresAt: asking.expiresAt.toISOString(),
    },
    enter: 'continue',
  };
}
