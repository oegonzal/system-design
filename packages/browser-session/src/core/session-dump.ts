import type {
  BrowserSessionStatus,
  BrowserTaskDto,
  PageObservation,
  SessionRailsDto,
} from '@sysdesign/contracts';
import { DUMP_SCHEMA_VERSION, jsonSafe, type DumpBytes, type DumpFile } from '@sysdesign/run-dump';

import type { UnitContext } from './open-unit';
import { causeOf, type BrowserActionKind, type DerivedRubric, type Termination } from './ports';

/**
 * The session dump: everything one session saw and decided, laid out the way
 * the loop lays out a run so the same readers apply. Pure builders — the
 * layout is decided here and written by `@sysdesign/run-dump`'s plumbing,
 * step by step as the session moves, the index row once at the end.
 *
 * NOTE FOR READERS: these files contain the goal, page text and screenshots.
 */
export const RUBRICS_FILE = '00-rubrics.json';
export const STEPS_DIR = '01-steps';
export const TASKS_FILE = '02-tasks.json';
export const MANIFEST_FILE = 'manifest.json';
export const GOAL_FILE = 'goal.md';

/** The files one step may leave: what was seen, what was decided, what went wrong. */
export const STEP_FILES = {
  observation: 'observation.json',
  snapshot: 'snapshot.txt',
  screenshot: 'screenshot.png',
  plan: 'plan.json',
  fault: 'fault.json',
  fields: 'fields.json',
  teach: 'teach.json',
  captures: 'captures.json',
  advice: 'advice.json',
} as const;
export type StepFile = keyof typeof STEP_FILES;

/** Where a step's images of its actions land, beside the step's own screenshot. */
const CAPTURES_DIR = 'captures';
/** How much of a name a file name carries: a name is the page's, a file name has a bound. */
const SLUG_MAX_LENGTH = 60;

const json = (value: unknown): string => `${JSON.stringify(jsonSafe(value), null, 2)}\n`;
const pad = (value: number): string => String(value).padStart(2, '0');
const withNewline = (text: string): string =>
  text.length === 0 || text.endsWith('\n') ? text : `${text}\n`;

const stepDir = (step: number): string => `${STEPS_DIR}/${pad(step)}`;
export const stepFile = (step: number, name: StepFile): string =>
  `${stepDir(step)}/${STEP_FILES[name]}`;

/** A name as a file name carries it: lower case, words joined by dashes, bounded. */
const slugOf = (name: string): string =>
  name
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');

/**
 * `00-rubrics.json`: the rubric each pipeline's runs are judged by, derived
 * once at open, keyed by pipeline id, each beside the loop's dump of its
 * derivation — where the deriver's prompt and reply can be read.
 */
export const rubricsFile = (rubrics: Readonly<Record<string, DerivedRubric>>): DumpFile => ({
  path: RUBRICS_FILE,
  content: json(rubrics),
});

/** What the step saw: the observation without its snapshot, the snapshot as text, the screenshot as bytes. */
export function observationFiles(
  step: number,
  observation: PageObservation,
  screenshot: Uint8Array | null,
): (DumpFile | DumpBytes)[] {
  const { ariaSnapshot, ...rest } = observation;
  return [
    { path: stepFile(step, 'observation'), content: json(rest) },
    { path: stepFile(step, 'snapshot'), content: withNewline(ariaSnapshot) },
    ...(screenshot === null ? [] : [{ path: stepFile(step, 'screenshot'), bytes: screenshot }]),
  ];
}

/** A step's decision record, as JSON. */
export const stepJsonFile = (
  step: number,
  name: Exclude<StepFile, 'observation' | 'snapshot' | 'screenshot'>,
  value: unknown,
): DumpFile => ({ path: stepFile(step, name), content: json(value) });

/** A labelled screenshot the plan asked for, beside the step's own. */
export const labelledScreenshot = (step: number, label: string, bytes: Uint8Array): DumpBytes => ({
  path: `${stepDir(step)}/screenshot-${slugOf(label)}.png`,
  bytes,
});

/** One image a step left after an action, as the step's `captures.json` lists it. */
export interface CaptureRecord {
  ordinal: number;
  /** Relative to the step's folder. */
  file: string;
  kind: BrowserActionKind;
  /** The action as the history reads it — a fill with its value, which no file name carries. */
  label: string;
  outcome: 'ok' | 'failed';
  /** Why the page refused the action, for one that failed; null for one that ran. */
  detail: string | null;
  at: string;
}

/**
 * Where a capture's image goes: its place in the step, its kind and the name
 * of what it touched — never the value it entered, which is personal and
 * unbounded and lives in `captures.json` alone.
 */
export const captureFileName = (
  ordinal: number,
  kind: BrowserActionKind,
  touched: string | null,
): string => {
  const slug = touched === null ? '' : slugOf(touched);
  return `${CAPTURES_DIR}/${pad(ordinal)}-${kind}${slug === '' ? '' : `-${slug}`}.png`;
};

/** A capture's image, and the step's list of captures so far, rewritten whole. */
export const captureFiles = (
  step: number,
  record: CaptureRecord,
  bytes: Uint8Array,
  all: readonly CaptureRecord[],
): (DumpFile | DumpBytes)[] => [
  { path: `${stepDir(step)}/${record.file}`, bytes },
  { path: stepFile(step, 'captures'), content: json(all) },
];

export interface ManifestInput {
  dumpRunId: string;
  sessionId: string;
  goalPath: string;
  goalHash: string;
  profile: string;
  headed: boolean;
  status: BrowserSessionStatus;
  termination: Termination;
  limits: SessionRailsDto;
  /** The settings files in force, by kind. */
  settings: Readonly<Record<string, string>>;
  steps: number;
  tasks: { started: number; closed: number };
  decisions: number;
  startedAt: Date;
  finishedAt: Date;
  error: { name: string; message: string } | null;
  /** Events still unpublished when the close stopped waiting for the bus; `replay-events` sends them again. */
  unsentEvents: readonly string[];
}

/** `manifest.json`: the session at a glance, every number the index row repeats. */
export function manifestOf(input: ManifestInput) {
  return {
    schemaVersion: DUMP_SCHEMA_VERSION,
    runId: input.dumpRunId,
    kind: 'session' as const,
    sessionId: input.sessionId,
    goalPath: input.goalPath,
    goalHash: input.goalHash,
    profile: input.profile,
    headed: input.headed,
    status: input.status,
    termination: input.termination,
    limits: input.limits,
    settings: input.settings,
    steps: input.steps,
    tasks: input.tasks,
    decisions: input.decisions,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
    error: input.error,
    unsentEvents: [...input.unsentEvents],
    note: 'Contains the goal, page text and screenshots verbatim.',
  };
}
export type SessionManifest = ReturnType<typeof manifestOf>;

/** A unit of work as the tasks file records it: the row, and what the page stated about the unit when it opened — the landmark, its words, the lines the bound left out. */
interface DumpedTask extends BrowserTaskDto {
  context: UnitContext | null;
}

/** The rows beside what the session kept of each unit's statement, by the unit's id. */
export const dumpedTasks = (
  rows: readonly BrowserTaskDto[],
  contexts: ReadonlyMap<string, UnitContext | null>,
): DumpedTask[] => rows.map((row) => ({ ...row, context: contexts.get(row.id) ?? null }));

/** The files written once the session is whole: the manifest, the goal and the units of work. */
export function closingFiles(
  manifest: SessionManifest,
  goalMarkdown: string,
  tasks: readonly DumpedTask[],
): DumpFile[] {
  return [
    { path: MANIFEST_FILE, content: json(manifest) },
    { path: GOAL_FILE, content: withNewline(goalMarkdown) },
    { path: TASKS_FILE, content: json(tasks) },
  ];
}

/** One line of `index.jsonl`: the claim that the folder is complete. */
export const indexRowOf = (manifest: SessionManifest): string =>
  `${JSON.stringify({
    runId: manifest.runId,
    kind: manifest.kind,
    at: manifest.finishedAt,
    status: manifest.status,
    sessionId: manifest.sessionId,
    termination: manifest.termination.reason,
    cause: causeOf(manifest.termination),
    steps: manifest.steps,
    tasks: manifest.tasks.closed,
    decisions: manifest.decisions,
  })}\n`;
