import { relative, resolve } from 'node:path';

import { CONFIG_DIR, ENGINE_FILE, readChosen, type ReadFile } from '@sysdesign/config-kit';
import { recoverySchema, type SessionRailsDto } from '@sysdesign/contracts';
import { z } from 'zod';

import { SessionConfigError, targetWithinBudget } from './config';
import type { CapturePolicy } from './core/engine-context';
import { BROWSER_ACTION_KINDS } from './core/ports';

/**
 * The session's settings, as files: the package's own `config/`, laid out the
 * way the repository's is — `config/engine.json` names one file per kind, and
 * each kind's files sit side by side under `config/<kind>/`, complete and
 * readable on their own, so switching is a one-word edit. Every kind must be
 * chosen: the values live in the files and nowhere else, so a choice that is
 * missing is a refusal naming the file, never a quiet default.
 *
 * Each field's meaning, and what its value was measured against, is said
 * here; the value itself only in the file, so the two can never disagree.
 */
type SettingsKind = 'capture' | 'session' | 'operator';

const unique = (kinds: readonly string[]): boolean => new Set(kinds).size === kinds.length;

/** What a session leaves as images beside the screenshot each step takes of the page it reads. */
const capturePolicySchema = z.strictObject({
  /**
   * Browser actions imaged once they ran — a plan's own and every field entry,
   * a value the operator typed into the page and the session read back
   * included. A field entry is outlined in its image. An action that replaces
   * the page races its image: the next step's screenshot is the page it led to.
   */
  after: z.array(z.enum(BROWSER_ACTION_KINDS)).refine(unique, 'lists a kind twice'),
  /** An action or entry the page refused, imaged as the page stood when it refused. */
  failures: z.boolean(),
}) satisfies z.ZodType<CapturePolicy>;

const positive = z.number().int().positive();

/** The engine's own stop rules: each a limit that ends the session `stopped`, but `targetDone`, its goal. */
const railsSchema = z
  .strictObject({
    /**
     * Units of work to close `done` before the session ends `complete`; null
     * when it has no such goal. A done unit spends `maxTasks` too, so the
     * target is never above it.
     */
    targetDone: positive.nullable(),
    /** Units of work the session may close done or failed; one found already done or set aside spends none. */
    maxTasks: positive,
    /**
     * Wall-clock minutes: a backstop against a session nobody is watching,
     * not a budget to plan against — one page is one brain call of one to
     * three minutes, and what ends a working session is closing its units.
     */
    maxMinutes: positive,
    /** Failed steps in a row before the session stops. */
    maxConsecutiveFailures: positive,
    /** Brain calls in a row that answered nothing before the session stops; an answered one clears the count. */
    maxBrainFaults: positive,
    /** Observations in a row the page could not be read from before the session stops. */
    maxUnreadablePages: positive,
    /**
     * Observations in a row of a page that did not change, whatever the steps
     * between them did. Measured 2026-10-07: twenty steps on one unchanged
     * empty document under a failure budget of twenty, then twelve reloads of
     * one landing page that a count of failed steps never saw.
     */
    maxStalledSteps: positive,
  })
  .refine(targetWithinBudget, {
    message:
      'is above maxTasks: every done unit spends that budget too, so the session would stop first',
    path: ['targetDone'],
  }) satisfies z.ZodType<SessionRailsDto>;

/** How a session runs when its command line says nothing else: each flag overrides its field for one run. */
const sessionDefaultsSchema = z.strictObject({
  /** Whether the browser shows; the operator is expected to watch, and is asked beside a highlighted field. */
  headed: z.boolean(),
  rails: railsSchema,
  /**
   * How long a session rides out a loop that is restarting before a call to
   * it is a brain fault. Measured 2026-10-10: fifteen watch-mode restarts of
   * the loop each listened again within six seconds, and three calls in the
   * three seconds of one restart ended a session forty minutes in.
   */
  loopRecovery: recoverySchema,
  /** How long a session rides out an advisor that is restarting before it plans on the advisor's last advice. */
  advisorRecovery: recoverySchema,
  /**
   * How long anything the session says on the notifications bus — a question
   * to the operator, an event for the record — rides out a service that is
   * restarting; and how long the close waits for the last events, in all.
   */
  busRecovery: recoverySchema,
});
export type SessionDefaults = z.infer<typeof sessionDefaultsSchema>;

/**
 * Asking the operator through the notifications service, which puts the
 * question on every channel it runs and brings the answer back as an event.
 */
const notificationsChannelSchema = z.strictObject({
  /** How long one wait for the answer lasts before it is asked again; within the service's own limit. */
  pullWaitMs: positive,
  /** The most events one wait takes: the session's own answer, and other askers' it passes over. */
  eventsPerPull: positive,
});

/**
 * Where the operator is asked. The terminal always is; each channel present
 * here is asked beside it, at once, and the first answer taken.
 */
const operatorSettingsSchema = z.strictObject({
  /**
   * How long a channel keeps offering a question the session never withdrew —
   * one that ended mid-question. A session waits on its operator for as long
   * as it takes; this only clears what a crash left behind.
   */
  expiresAfterMs: positive,
  /**
   * How many times a question is put back, with why, once the page refused
   * the operator's answer to it — so an answer can be chosen again, or one
   * fixed in the browser read back and kept; past that, the refusal stands.
   */
  asksAfterRefusal: z.number().int().nonnegative(),
  channels: z.strictObject({ notifications: notificationsChannelSchema.optional() }),
});
export type OperatorSettings = z.infer<typeof operatorSettingsSchema>;

export interface SessionSettings {
  capture: CapturePolicy;
  session: SessionDefaults;
  operator: OperatorSettings;
  /** Where each kind's settings came from, as a path from the working directory. */
  sources: Readonly<Record<SettingsKind, string>>;
}

/**
 * Every kind, read once at boot and checked by name. A file that is not JSON
 * or names a field the schema does not is the kit's refusal; a kind the
 * choices leave out is this one, naming where the choices were looked for —
 * a session started from the wrong place reads no choices at all.
 */
export function readSessionSettings(root: string, read?: ReadFile): SessionSettings {
  const chosen = <T>(kind: SettingsKind, schema: z.ZodType<T>): { config: T; source: string } => {
    const found = readChosen(kind, schema, root, read);
    if (found === null) {
      throw new SessionConfigError(
        `${resolve(root, CONFIG_DIR, ENGINE_FILE)} chooses no ${kind}: name a file under ${resolve(root, CONFIG_DIR, kind)}`,
      );
    }
    return { config: found.config, source: relative(process.cwd(), resolve(root, found.source)) };
  };
  const capture = chosen('capture', capturePolicySchema);
  const session = chosen('session', sessionDefaultsSchema);
  const operator = chosen('operator', operatorSettingsSchema);
  return {
    capture: capture.config,
    session: session.config,
    operator: operator.config,
    sources: { capture: capture.source, session: session.source, operator: operator.source },
  };
}
