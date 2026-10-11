import { choiceKey, excerpt, howToAnswer, type InteractionPrompt } from '@sysdesign/contracts';

import type { InlineKeyboard } from './bot-api';

/** Telegram's limit on one message's text. */
export const TELEGRAM_TEXT_MAX = 4_096;
/** Kept free in every part, so the last can take the line that says how the prompt ended. */
const OUTCOME_ROOM = 600;
/** Clients cut a long button short; a command's button shows this much of its label. */
const BUTTON_TEXT_MAX = 64;

/** How many choices become buttons, and how many buttons share a row; past the first, letters are typed. */
export interface ButtonLimits {
  maxChoiceButtons: number;
  buttonsPerRow: number;
}

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * One line of HTML, cut into pieces that each fit `limit` once escaped: the
 * markup before the text goes on the first piece and the markup after it on
 * the last, so no piece is cut inside a tag or an entity.
 */
function lineParts(before: string, raw: string, after: string, limit: number): string[] {
  const pieces: string[] = [];
  let current = before;
  for (const character of raw) {
    const escaped = escapeHtml(character);
    if (current.length + escaped.length > limit) {
      pieces.push(current);
      current = '';
    }
    current += escaped;
  }
  if (current.length + after.length > limit) {
    pieces.push(current);
    current = '';
  }
  pieces.push(current + after);
  return pieces;
}

/** Lines packed into as few parts as fit `limit`, each line whole, in order. */
function packed(lines: readonly string[], limit: number): string[] {
  const parts: string[] = [];
  let current: string | null = null;
  for (const line of lines) {
    if (current === null) current = line;
    else if (current.length + 1 + line.length <= limit) current = `${current}\n${line}`;
    else {
      parts.push(current);
      current = line;
    }
  }
  return current === null ? [] : [...parts, current];
}

function keyboardOf(prompt: InteractionPrompt, limits: ButtonLimits): InlineKeyboard | null {
  const rows: InlineKeyboard = [];
  if (prompt.choices.length > 0 && prompt.choices.length <= limits.maxChoiceButtons) {
    const keys = prompt.choices.map((_, index) => choiceKey(index));
    for (let at = 0; at < keys.length; at += limits.buttonsPerRow) {
      rows.push(
        keys.slice(at, at + limits.buttonsPerRow).map((key) => ({ text: key, callback_data: key })),
      );
    }
  }
  // A button sends exactly what typing it would, so a press is read like any reply.
  for (const command of prompt.commands) {
    rows.push([{ text: excerpt(command.label, BUTTON_TEXT_MAX), callback_data: `/${command.id}` }]);
  }
  return rows.length === 0 ? null : rows;
}

/**
 * A prompt as Telegram messages: its title, who asks, its details, its
 * choices lettered as every channel letters them with their notes, and how it
 * is answered — in as few parts as fit a message with room kept for its
 * outcome — and the buttons that go under the last part.
 */
export function renderPrompt(
  prompt: InteractionPrompt,
  limits: ButtonLimits,
): { parts: string[]; keyboard: InlineKeyboard | null } {
  const limit = TELEGRAM_TEXT_MAX - OUTCOME_ROOM;
  const line = (before: string, raw: string, after = ''): string[] =>
    lineParts(before, raw, after, limit);
  const lines = [
    ...line('<b>', prompt.title, '</b>'),
    ...(prompt.origin.label === '' ? [] : line('<i>', prompt.origin.label, '</i>')),
    ...prompt.details.flatMap((detail) => line('', detail)),
    ...(prompt.choices.length === 0 ? [] : ['']),
    ...prompt.choices.flatMap((choice, index) =>
      line(
        `<b>${choiceKey(index)}</b> — `,
        choice.label,
        choice.note === null ? '' : ` <i>(${escapeHtml(excerpt(choice.note, 200))})</i>`,
      ),
    ),
    '',
    ...line('', howToAnswer(prompt)),
  ];
  return { parts: packed(lines, limit), keyboard: keyboardOf(prompt, limits) };
}

/** The last part of a prompt with how it ended beneath it, its buttons gone: what a closed message shows. */
export function closedPart(
  prompt: InteractionPrompt,
  limits: ButtonLimits,
  outcome: string,
): string {
  const { parts } = renderPrompt(prompt, limits);
  const last = parts[parts.length - 1] ?? '';
  return `${last}\n\n<b>${escapeHtml(excerpt(outcome, OUTCOME_ROOM - 20))}</b>`;
}
