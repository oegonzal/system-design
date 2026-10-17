import { randomUUID } from 'node:crypto';

import {
  excerpt,
  PROMPT_LIMITS,
  TOOL_SESSION_ORIGIN_KIND,
  type Ask,
  type InteractionAnswer,
  type InteractionPrompt,
  type ToolCall,
  type ToolDeclaration,
  type ToolSessionRecord,
} from '@sysdesign/contracts';
import { notedPrompt } from '@sysdesign/notifications-client';

/** Who asks: the session, by its id, labelled by its title. */
export const sessionOrigin = (
  session: Pick<ToolSessionRecord, 'id' | 'title'>,
): InteractionPrompt['origin'] => ({
  kind: TOOL_SESSION_ORIGIN_KIND,
  id: session.id,
  label: excerpt(session.title, PROMPT_LIMITS.noteMaxLength),
});

const detail = (text: string): string => excerpt(text, PROMPT_LIMITS.detailMaxLength);
const title = (text: string): string => excerpt(text, PROMPT_LIMITS.titleMaxLength);

/** The two answers an approval takes; the ids a channel letters a and b. */
const APPROVAL_CHOICES = [
  { id: 'yes', label: 'Yes, run it', note: null },
  { id: 'no', label: 'No', note: null },
] as const;

/** The one command a question offers beside an answer. */
export const STOP_COMMAND = { id: 'stop', label: 'End the session' } as const;

/** A call a person says yes or no to before it runs: the tool, what it does, the arguments and the plan's reason. */
export function approvalPrompt(
  call: ToolCall,
  tool: ToolDeclaration,
  origin: InteractionPrompt['origin'],
  expiresAt: Date,
): InteractionPrompt {
  return {
    id: randomUUID(),
    origin,
    title: title(`Run ${call.tool}?`),
    details: [
      detail(tool.description),
      detail(`Arguments: ${call.argumentsJson}`),
      detail(`Why: ${call.reason}`),
    ],
    choices: [...APPROVAL_CHOICES],
    freeText: null,
    commands: [],
    expiresAt: expiresAt.toISOString(),
  };
}

/** Whether the answer to an approval is yes: the choice alone says so. */
export const approved = (answer: InteractionAnswer): boolean =>
  answer.reply.kind === 'choice' && answer.reply.choiceId === 'yes';

/** The question a plan ends on: the plan's options as choices, the person's own words, and the way out. */
export function questionPrompt(
  ask: Ask,
  origin: InteractionPrompt['origin'],
  expiresAt: Date,
): InteractionPrompt {
  return {
    id: randomUUID(),
    origin,
    title: title(ask.question),
    details: [],
    choices: ask.options.map((option, position) => ({
      id: `o${position + 1}`,
      label: excerpt(option, PROMPT_LIMITS.choiceLabelMaxLength),
      note: null,
    })),
    freeText: { maxLength: null },
    commands: [STOP_COMMAND],
    expiresAt: expiresAt.toISOString(),
  };
}

/** The operator's reply to a question, as the session acts on it: the option's own text, the words typed, or the stop. */
export type QuestionReply = { kind: 'answer'; text: string } | { kind: 'stop' };

export function questionReplyOf(ask: Ask, answer: InteractionAnswer): QuestionReply {
  const { reply } = answer;
  switch (reply.kind) {
    case 'choice': {
      const position = Number(reply.choiceId.replace(/^o/, '')) - 1;
      const option = ask.options[position];
      if (option === undefined) {
        throw new Error(
          `the answer names choice ${reply.choiceId}, which the question never offered`,
        );
      }
      return { kind: 'answer', text: option };
    }
    case 'text':
      return { kind: 'answer', text: reply.text };
    case 'command':
      if (reply.commandId === STOP_COMMAND.id) return { kind: 'stop' };
      throw new Error(
        `the answer gives command /${reply.commandId}, which the question never offered`,
      );
  }
}

/** How long a session's notice stays on a channel: a week, like the alerts the other services post. */
const NOTICE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

/** The session as it ended, told once: its status and cause, what it was about, and what it did. */
export function summaryPrompt(record: ToolSessionRecord, now: Date): InteractionPrompt {
  const calls = record.steps.flatMap((step) => step.calls);
  const ok = calls.filter((call) => call.outcome === 'ok').length;
  const ending = record.ending;
  return notedPrompt({
    origin: sessionOrigin(record),
    title: `${record.service} session ${record.status}${ending === null ? '' : `: ${ending.cause}`}`,
    details: [
      `Mission: ${record.title}`,
      `${record.steps.length} step${record.steps.length === 1 ? '' : 's'}, ${calls.length} call${calls.length === 1 ? '' : 's'} (${ok} ok)`,
      ...(ending === null ? [] : [ending.detail]),
    ],
    expiresAt: new Date(now.getTime() + NOTICE_TTL_MS),
  });
}
