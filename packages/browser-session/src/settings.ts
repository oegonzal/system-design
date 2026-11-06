import { relative, resolve } from 'node:path';

import { memoryBindingSchema } from '@sysdesign/agentic-memory-client';
import { CONFIG_DIR, ENGINE_FILE, readChosen, type ReadFile } from '@sysdesign/config-kit';
import {
  answeringSettingsSchema,
  channelIdSchema,
  FIELD_TYPES,
  recordScopeSchema,
  recoverySchema,
  type AnsweringSettings,
  type HitsPerFieldType,
  type SessionRailsDto,
} from '@sysdesign/contracts';
import { z } from 'zod';

import type { ObservePolicy } from './adapters/playwright/observe-policy';
import { SessionConfigError, targetWithinBudget } from './config';
import type { CapturePolicy } from './core/engine-context';
import type { SessionLiveness } from './core/liveness';
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
type SettingsKind = 'capture' | 'session' | 'operator' | 'answering' | 'observe' | 'brain';

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

/** How the browser waits on and reads a page; each field's meaning is `ObservePolicy`'s. */
const observePolicySchema = z.strictObject({
  actionTimeoutMs: positive,
  pageOpenWaitMs: positive,
  newPageWaitMs: positive,
  settleTimeoutMs: positive,
  snapshotTimeoutMs: positive,
  settleRetryMs: positive,
  emptySnapshotReads: positive,
  factsTimeoutMs: positive,
  observeBudgetMs: positive,
  wholesaleReads: positive,
  stableReads: positive,
  scrollPx: positive,
  optionWaitMs: positive,
}) satisfies z.ZodType<ObservePolicy>;

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
     * No unit of work starts once they have elapsed.
     */
    maxMinutes: positive,
    /**
     * Minutes a unit of work open when `maxMinutes` elapse may still take to
     * close, so an application in hand is finished rather than abandoned —
     * and, abandoned, avoided by the record as if it had been sent. Measured
     * 2026-10-30: units took 4 to 68 minutes to close (47 of the 68 waiting
     * on the operator), and two of seven were abandoned at the limit, one
     * opened two minutes before it. 0 ends the session at the limit.
     */
    unitGraceMinutes: z.number().int().nonnegative(),
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
  /** How often a running session beats, and how long a silence a reader takes for death. */
  liveness: z
    .strictObject({ heartbeatEveryMs: positive, staleAfterMs: positive })
    .refine((liveness) => liveness.heartbeatEveryMs * 2 <= liveness.staleAfterMs, {
      message: 'a session beats at least twice inside the window it is taken for dead after',
    }) satisfies z.ZodType<SessionLiveness>,
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
  /**
   * The channels whose answers are kept for the session alone, by the id each
   * answer carries (`via.channel`): filled, cached for the unit of work,
   * recorded on the row with the channel, and taught to nobody — the step
   * says so. Every other channel's answers are taught to the memory as the
   * subject's own. Named this way round because the session knows one channel
   * by name, its own terminal (`terminal`); the channels the notifications
   * service runs are the service's to name, never this package's. Measured
   * 2026-10-19: answers typed at the terminal by an automated process on the
   * owner's behalf were stored as the owner's facts and outranked his
   * standing answers. An empty list teaches every answer.
   */
  untaught: z.array(channelIdSchema).refine(unique, 'names a channel twice'),
});
export type OperatorSettings = z.infer<typeof operatorSettingsSchema>;

/**
 * The brain that decides for a session: the loop alone, or the loop for plans
 * and judgements with a memory space, served by the agentic-system host, for
 * what a field's answer rests on and for what the operator teaches.
 */
const loopBrainSettingsSchema = z.strictObject({ adapter: z.literal('loop') });

/**
 * The run a binding names while nobody has judged the space's strategy yet:
 * the file reads, so a command that binds nothing runs, and a brain asked to
 * bind is refused by name before it could ensure a space from a run nobody
 * chose — the space's name is held by the first run to ensure it, and no
 * route gives it back. Replaced by the judged run's id (RUNBOOK, "The job
 * assistant's own memory space").
 */
export const UNJUDGED_RUN = 'unjudged';

/** A role as the binding keys it: what this program calls one kind of memory it keeps, whatever the register is named. */
const role = z.string().min(1);

/** One line, no whitespace at either end: what the goal prints as one line reads back as one. */
const oneLine = (text: string): boolean => text === text.trim() && !/[\r\n\u2028\u2029]/.test(text);

/** What the goal's legend says of one register the evidence may be of. */
const legendEntrySchema = z.strictObject({
  /** The register, by the name the binding gives a facts role's register. */
  kind: z.string().min(1),
  /** What the register's items are for, as the goal explains them over the evidence. */
  use: z.string().min(1).refine(oneLine, 'is not one line'),
});

/**
 * How deep a page's recall draws: hits per probe by the kind of control
 * asking — a total table over the field types, so a new type is classified or
 * the file refuses — the most items one goal lists, dealt by rank across the
 * fields, and how many recalls run at once.
 */
const recallSettingsSchema = z.strictObject({
  hitsPerFieldType: z.record(z.enum(FIELD_TYPES), positive) satisfies z.ZodType<HitsPerFieldType>,
  maxEvidence: positive,
  concurrency: positive,
});

const memoryBrainShape = z.strictObject({
  adapter: z.literal('memory'),
  /** What this program needs of the space, as the client declares it; checked against the host once at boot. */
  binding: memoryBindingSchema,
  /** The value every request names under the space's `project` key: this program's own partition within the tenant's. */
  project: recordScopeSchema.valueType,
  /** The roles whose registers are recalled for a field, in the order the legend lists them. */
  facts: z.array(role).min(1).refine(unique, 'names a role twice'),
  /** The role the operator's answers are taught to — one of `facts`, so what is taught is recalled. */
  teach: role,
  /** The legend the goal prints over the evidence: each facts role's register, and what its items are for. */
  legend: z.array(legendEntrySchema),
  recall: recallSettingsSchema,
});

/** One field at fault, by its path, in the words the refusal carries. */
interface SettingsFault {
  path: (string | number)[];
  message: string;
}

/**
 * What the memory brain's fields must agree on, beyond each field's own
 * shape: every facts role is a role of the binding whose register is
 * recalled; the teach role is among them and its register remembered to; and
 * the legend explains each facts role's register once, and no other.
 */
function memoryBrainFaults({
  binding,
  facts,
  teach,
  legend,
}: z.infer<typeof memoryBrainShape>): SettingsFault[] {
  const faults: SettingsFault[] = [];
  facts.forEach((name, index) => {
    const need = binding.registers[name];
    if (need === undefined) {
      faults.push({ path: ['facts', index], message: `is no role of the binding: ${name}` });
    } else if (!need.operations.includes('recall')) {
      faults.push({
        path: ['facts', index],
        message: `role ${name} declares no recall, and a facts role is recalled`,
      });
    }
  });
  if (!facts.includes(teach)) {
    faults.push({
      path: ['teach'],
      message: 'is not among facts: what is taught must be recalled',
    });
  } else if (!binding.registers[teach]?.operations.includes('remember')) {
    faults.push({
      path: ['teach'],
      message: `role ${teach} declares no remember, and the teach role is written to`,
    });
  }
  const declared = facts.flatMap((name) => binding.registers[name]?.name ?? []);
  const explained = legend.map((entry) => entry.kind);
  const unexplained = declared.filter((kind) => !explained.includes(kind));
  const forNoRole = explained.filter((kind) => !declared.includes(kind));
  if (!unique(explained)) faults.push({ path: ['legend'], message: 'explains a register twice' });
  if (unexplained.length > 0) {
    faults.push({ path: ['legend'], message: `explains no ${unexplained.join(', ')}` });
  }
  if (forNoRole.length > 0) {
    faults.push({
      path: ['legend'],
      message: `explains ${forNoRole.join(', ')} for no facts role`,
    });
  }
  return faults;
}

const memoryBrainSettingsSchema = memoryBrainShape.superRefine((settings, ctx) => {
  for (const fault of memoryBrainFaults(settings)) ctx.addIssue({ code: 'custom', ...fault });
});
export type MemoryBrainSettings = z.infer<typeof memoryBrainSettingsSchema>;

const brainSettingsSchema = z.discriminatedUnion('adapter', [
  loopBrainSettingsSchema,
  memoryBrainSettingsSchema,
]);
export type BrainSettings = z.infer<typeof brainSettingsSchema>;

export interface SessionSettings {
  capture: CapturePolicy;
  session: SessionDefaults;
  operator: OperatorSettings;
  /**
   * Which kinds of evidence-backed value a session types without asking, by
   * the kind each answer declares it rests on — the contracts' schema, since
   * the read-back routes by it; total over the vocabulary, `none` always asked.
   * Measured 2026-10-12: of 34 such values the read-back had sent to the
   * operator with a known answer, 30 matched what the operator then typed.
   */
  answering: AnsweringSettings;
  /** How the browser waits on and reads a page. */
  observe: ObservePolicy;
  /**
   * Which brain decides for the session, and under `memory` what it needs of
   * the space: the binding is checked against the host once at boot, before
   * any row, and a tenant left unnamed refuses it by name.
   */
  brain: BrainSettings;
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
  const answering = chosen('answering', answeringSettingsSchema);
  const observe = chosen('observe', observePolicySchema);
  const brain = chosen('brain', brainSettingsSchema);
  return {
    capture: capture.config,
    session: session.config,
    operator: operator.config,
    answering: answering.config,
    observe: observe.config,
    brain: brain.config,
    sources: {
      capture: capture.source,
      session: session.source,
      operator: operator.source,
      answering: answering.source,
      observe: observe.source,
      brain: brain.source,
    },
  };
}
