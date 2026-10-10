import { closedOptionsOf, quoted } from '@sysdesign/contracts';

import type { OperatorPort, OperatorPrompt, OperatorReply } from './ports';

/**
 * The option a typed answer names, spelled as the page lists it: the option
 * itself, else the one option equal to it but for case; null when it names
 * none, or more than one.
 */
export function listedOptionOf(options: readonly string[], typed: string): string | null {
  const text = typed.trim();
  if (options.includes(text)) return text;
  const named = options.filter(
    (option) => option.localeCompare(text, undefined, { sensitivity: 'accent' }) === 0,
  );
  return named.length === 1 ? (named[0] ?? null) : null;
}

/**
 * The operator's reply to a field, held to the field's closed option list the
 * way the answerer's value is held by its validators. An answer naming a listed
 * option comes back in the page's spelling; one naming none is refused with the
 * options shown, and the operator is asked again. Measured 2026-10-10: "yes"
 * typed for a Yes | No question matched no radio, the fill timed out, and the
 * eight fields after it on the page were never attempted.
 */
export async function askListed(
  operator: OperatorPort,
  prompt: OperatorPrompt,
): Promise<OperatorReply> {
  const options = closedOptionsOf(prompt.field);
  for (;;) {
    const reply = await operator.ask(prompt);
    if (reply.kind !== 'answer' || options === null) return reply;
    const option = listedOptionOf(options, reply.text);
    if (option !== null) return { kind: 'answer', text: option };
    operator.notify(
      `${quoted(reply.text)} is not one of this field's options: ${options.join(' | ')}`,
    );
  }
}
