import { randomUUID } from 'node:crypto';

import { excerpt, PROMPT_LIMITS, type InteractionPrompt } from '@sysdesign/contracts';

/** What a notice says: who it is from and about, its one line, and the lines under it. */
export interface Notice {
  origin: InteractionPrompt['origin'];
  title: string;
  details: readonly string[];
  /** When the service stops showing it; nobody withdraws a notice. */
  expiresAt: Date;
}

/** The one choice a notice offers: a prompt must offer some way to answer, and a notice asks nothing. */
export const NOTED = { id: 'noted', label: 'Noted', note: null } as const;

/**
 * A notice as a prompt: one `Noted` choice, no free text, no commands, so a
 * channel renders it as progress and never as a question — the one way a
 * program tells a person something through the notifications service, which
 * delivers prompts alone. Published with `BusClient.publish`, never asked:
 * nobody waits for a notice to be read. Every line is cut to the prompt's
 * declared limits, so a notice is never refused for its length.
 */
export function notedPrompt(notice: Notice): InteractionPrompt {
  return {
    id: randomUUID(),
    origin: notice.origin,
    title: excerpt(notice.title, PROMPT_LIMITS.titleMaxLength),
    details: notice.details
      .slice(0, PROMPT_LIMITS.details)
      .map((detail) => excerpt(detail, PROMPT_LIMITS.detailMaxLength)),
    choices: [NOTED],
    freeText: null,
    commands: [],
    expiresAt: notice.expiresAt.toISOString(),
  };
}
