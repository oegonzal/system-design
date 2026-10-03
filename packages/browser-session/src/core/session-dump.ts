import type {
  BrowserSessionStatus,
  BrowserTaskDto,
  PageObservation,
  SessionRailsDto,
} from '@sysdesign/contracts';
import {
  appendIndexRow,
  DUMP_SCHEMA_VERSION,
  jsonSafe,
  makeRunId,
  writeDumpFiles,
  type DumpBytes,
  type DumpFile,
} from '@sysdesign/run-dump';

import type { DumpStore, Termination } from './ports';

/**
 * The session dump: everything one session saw and decided, laid out the way
 * the loop lays out a run so the same readers apply. Pure builders — the
 * layout is decided here and written by `@sysdesign/run-dump`'s plumbing,
 * step by step as the session moves, the index row once at the end.
 *
 * NOTE FOR READERS: these files contain the goal, page text and screenshots.
 */
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
} as const;
export type StepFile = keyof typeof STEP_FILES;

const json = (value: unknown): string => `${JSON.stringify(jsonSafe(value), null, 2)}\n`;
const pad = (value: number): string => String(value).padStart(2, '0');
const withNewline = (text: string): string =>
  text.length === 0 || text.endsWith('\n') ? text : `${text}\n`;

export const stepDir = (step: number): string => `${STEPS_DIR}/${pad(step)}`;
export const stepFile = (step: number, name: StepFile): string =>
  `${stepDir(step)}/${STEP_FILES[name]}`;

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
  path: `${stepDir(step)}/screenshot-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`,
  bytes,
});

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
  steps: number;
  tasks: { started: number; closed: number };
  decisions: number;
  startedAt: Date;
  finishedAt: Date;
  error: { name: string; message: string } | null;
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
    steps: input.steps,
    tasks: input.tasks,
    decisions: input.decisions,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
    error: input.error,
    note: 'Contains the goal, page text and screenshots verbatim.',
  };
}
export type SessionManifest = ReturnType<typeof manifestOf>;

/** The files written once the session is whole: the manifest, the goal and the units of work. */
export function closingFiles(
  manifest: SessionManifest,
  goalMarkdown: string,
  tasks: readonly BrowserTaskDto[],
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
    steps: manifest.steps,
    tasks: manifest.tasks.closed,
    decisions: manifest.decisions,
  })}\n`;

/** The dump directory on disk, through the shared plumbing: temp-and-rename per file, one index row per session. */
export function fsDumpStore(dir: string): DumpStore {
  return {
    open(now) {
      const runId = makeRunId(now.getTime(), 'session');
      return {
        runId,
        write: (files) => {
          writeDumpFiles(runId, files, dir);
        },
        index: (row) => appendIndexRow(row, dir),
      };
    },
  };
}
