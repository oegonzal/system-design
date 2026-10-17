import { relative, resolve } from 'node:path';

import { CONFIG_DIR, ENGINE_FILE, readChosen, type ReadFile } from '@sysdesign/config-kit';
import { recoverySchema } from '@sysdesign/contracts';
import { toolSessionSettingsSchema, type ToolSessionSettings } from '@sysdesign/tool-session';
import { z } from 'zod';

import { GmailConfigError } from './config';

/**
 * The service's settings, as files under the package's own `config/`, laid
 * out the way the repository's is: `config/engine.json` names one file per
 * kind and each kind's files sit under `config/<kind>/`. Every kind must be
 * chosen; a choice that is missing is a refusal naming where the choices
 * were looked for, never a quiet default.
 */
const positive = z.number().int().positive();

/** The inbox watcher: whether it runs, how often it asks after new mail, and how long its notices stay. */
export const watchSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  pollEveryMs: positive,
  noticeTtlMs: positive,
});
export type WatchSettings = z.infer<typeof watchSettingsSchema>;

/** The programs whose tools join every session, by the ids `config.ts` binds to URLs. */
export const peersSettingsSchema = z.strictObject({ peers: z.array(z.string().min(1)) });

/** How much of the mailbox a tool answers with. */
export const mailboxSettingsSchema = z.strictObject({
  /** Threads a search lists when the call names no count. */
  searchMax: positive,
  /** The most threads a search may list. */
  searchCeiling: positive,
  /** The most of a message's text one read answers with. */
  bodyMaxLength: positive,
  /** The most of each message's text a thread read answers with. */
  messageInThreadMaxLength: positive,
  /** How long a call to the mailbox rides out a rate limit or a server error. */
  recovery: recoverySchema,
});
export type MailboxSettings = z.infer<typeof mailboxSettingsSchema>;

type SettingsKind = 'session' | 'watch' | 'peers' | 'mailbox';

export interface GmailSettings {
  session: ToolSessionSettings;
  watch: WatchSettings;
  peers: z.infer<typeof peersSettingsSchema>;
  mailbox: MailboxSettings;
  /** Where each kind's settings came from, as a path from the working directory. */
  sources: Readonly<Record<SettingsKind, string>>;
}

export function readSettings(root: string, read?: ReadFile): GmailSettings {
  const chosen = <T>(kind: SettingsKind, schema: z.ZodType<T>): { config: T; source: string } => {
    const found = readChosen(kind, schema, root, read);
    if (found === null) {
      throw new GmailConfigError(
        `${resolve(root, CONFIG_DIR, ENGINE_FILE)} chooses no ${kind}: name a file under ${resolve(root, CONFIG_DIR, kind)}`,
      );
    }
    return { config: found.config, source: relative(process.cwd(), resolve(root, found.source)) };
  };
  const session = chosen('session', toolSessionSettingsSchema);
  const watch = chosen('watch', watchSettingsSchema);
  const peers = chosen('peers', peersSettingsSchema);
  const mailbox = chosen('mailbox', mailboxSettingsSchema);
  return {
    session: session.config,
    watch: watch.config,
    peers: peers.config,
    mailbox: mailbox.config,
    sources: {
      session: session.source,
      watch: watch.source,
      peers: peers.source,
      mailbox: mailbox.source,
    },
  };
}
