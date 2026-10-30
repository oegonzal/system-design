import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  fieldQuestionOf,
  operatorGuidanceSchema,
  SUGGESTION_BASES,
  unitKeyOf,
  type BrowserTaskDto,
  type OperatorGuidanceDto,
  type SuggestionBasis,
} from '@sysdesign/contracts';

import type { TeachReceipt } from '../../core/ports';
import { STEP_FILES, STEPS_DIR, TASKS_FILE } from '../../core/session-dump';

/**
 * The operator answers a folder of session dumps recorded, read back as the
 * items `teach-again` teaches. Everything read is declared data the session
 * wrote: each step's `fields.json` carries the guidance item as it was taught
 * (an older item under its label and context, a newer one under its
 * question), `teach.json` the decision row each went through and what the
 * memory did with it — today the reference it left, the outcome and the
 * subject at the top; before receipts, the orchestration the loop digested it
 * on and the document the subject was on — and `02-tasks.json` the units of
 * work and the steps each was open for: the unit an older item, recorded
 * before answers named theirs, was given in. A reader branches on the fields
 * a record carries, never on the dump's age; a record it cannot read is named,
 * never guessed at.
 */

/** One recorded answer: the item to teach, the row it came from, and the orchestration the loop digested it on when one did. */
export interface RecordedAnswer {
  item: OperatorGuidanceDto;
  decisionId: string | null;
  earlierOrchestrationId: string | null;
}

interface StepFields {
  fields?: {
    result?: {
      guidance?: Record<string, unknown> | null;
      chosen?: string | null;
      via?: string | null;
    } | null;
  }[];
}

/** What a field's result says of its answer besides the item: the basis it was chosen from, and the channel it came on. */
interface AnswerResult {
  chosen: unknown;
  via: unknown;
}

/** A teaching as a step's `teach.json` records it, in either shape the file has had. */
interface StepTeaching {
  decisionId: string;
  /** Today: the reference the memory left and what it did, the subject at the top. */
  ref?: string | null;
  outcome?: TeachReceipt['outcome'] | null;
  subject?: string;
  /** Before receipts: the orchestration the loop digested the answer on, and the document the subject was on. */
  orchestrationRunId?: string | null;
  document?: { subject?: string };
}

/** The orchestration the loop digested a teaching on: named outright by an older teaching, and by a newer one its brain queued there; a record the memory wrote itself was digested nowhere. */
const orchestrationOf = (teaching: StepTeaching): string | null =>
  teaching.orchestrationRunId ?? (teaching.outcome === 'queued' ? (teaching.ref ?? null) : null);

/** Whom a teaching says its answer is about, from wherever its shape keeps it. */
const subjectOf = (teaching: StepTeaching): string | null =>
  teaching.subject ?? teaching.document?.subject ?? null;

const suggestionBasisOf = (chosen: unknown): SuggestionBasis | null =>
  typeof chosen === 'string' && (SUGGESTION_BASES as readonly string[]).includes(chosen)
    ? (chosen as SuggestionBasis)
    : null;

/** The one field whose absence is a declared nothing-to-teach rather than a record this reader cannot read. */
const CHANNEL_FIELD = 'via';

/**
 * A recorded item read: the item in today's shape; or nothing, with why when
 * the record held an item this reader could not read — a shape the schema
 * refuses — and nothing to say for the two declared nothings, an item that
 * asked nothing it can be told by and one that names no channel.
 */
type GuidanceRead =
  { item: OperatorGuidanceDto; unreadable: null } | { item: null; unreadable: string | null };

const nothing = (unreadable: string | null = null): GuidanceRead => ({ item: null, unreadable });

/**
 * A recorded guidance item in today's shape. An older item carried `label`
 * (the field's name) and `question` (its context) and no `chosen`; the key is
 * what the field asked, as `fieldQuestionOf` reads both, and the basis the
 * answer was chosen from is the item's own, else the result's — as is the
 * channel it came on, which an item before 2026-10-20 carried only on its
 * result. An item recorded before answers named their unit of work is given
 * in the unit the dump records open at its step (`openUnit`, null outside
 * any); a newer one names its own. Nothing for an item that asked nothing it
 * can be told by, which no probe could find again, and for one that names no
 * channel anywhere, which nobody can vouch for; an item the schema refuses for
 * any other field is unreadable, and says which field.
 */
function guidanceItemOf(
  raw: Record<string, unknown>,
  result: AnswerResult,
  openUnit: string | null,
): GuidanceRead {
  const field = (raw['field'] ?? {}) as Record<string, unknown>;
  const label = typeof field['label'] === 'string' ? field['label'] : '';
  const context = typeof field['question'] === 'string' ? field['question'] : null;
  const question = fieldQuestionOf({ name: label, context });
  if (question === null) return nothing();
  const given = (raw['context'] ?? {}) as Record<string, unknown>;
  const parsed = operatorGuidanceSchema.safeParse({
    sessionId: raw['sessionId'],
    capturedAt: raw['capturedAt'],
    field: { question, type: field['type'], options: field['options'] ?? null },
    context: { ...given, unitKey: Object.hasOwn(given, 'unitKey') ? given['unitKey'] : openUnit },
    answer: raw['answer'],
    about: raw['about'] ?? null,
    chosen: suggestionBasisOf(raw['chosen'] ?? result.chosen),
    via: raw['via'] ?? result.via,
  });
  if (parsed.success) return { item: parsed.data as OperatorGuidanceDto, unreadable: null };
  const faults = parsed.error.issues.filter((issue) => issue.path.join('.') !== CHANNEL_FIELD);
  if (faults.length === 0) return nothing();
  return nothing(faults.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; '));
}

/** A file's JSON, or null for a file nobody can read or that is not JSON: the dumps' one lenient read. */
export const readJson = async (path: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
};

/** The dump folders under a directory, by name in order; none for a directory nobody can read. */
export const dumpFolders = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/**
 * What one dump folder recorded: its guidance items in step and field order —
 * null for one that asks nothing it can be told by, names no channel, or
 * could not be read — its teachings in the order they were made, whom they
 * name, and each item this reader could not read, by step and field.
 */
interface DumpRecord {
  items: (OperatorGuidanceDto | null)[];
  teachings: StepTeaching[];
  subject: string | null;
  unreadable: string[];
}

/** A unit of work as the dump's tasks file records it: an older one carries no facets. */
type DumpTask = Pick<BrowserTaskDto, 'id' | 'startStep' | 'endStep'> &
  Partial<Pick<BrowserTaskDto, 'facets'>>;

/**
 * The task the dump records open at a step — the one whose steps cover it, an
 * open one covering every step from its first — or undefined when none does:
 * outside any unit of work, or in a dump whose session never closed and wrote
 * no tasks. The one reading of a tasks file every reader of a dump shares.
 */
export const taskCoveringStep = <Task extends Pick<BrowserTaskDto, 'startStep' | 'endStep'>>(
  tasks: readonly Task[],
  step: number,
): Task | undefined =>
  tasks.find((candidate) => candidate.startStep <= step && (candidate.endStep ?? Infinity) >= step);

/** The unit of work the dump records open at a step, keyed as the session keys one (`unitKeyOf`); null when none covers it. */
function unitOpenAt(tasks: readonly DumpTask[], step: number): string | null {
  const task = taskCoveringStep(tasks, step);
  return task === undefined ? null : unitKeyOf({ id: task.id, facets: task.facets ?? [] });
}

/**
 * Read one dump. A session taught one item at a time, in the order the items
 * settled, and each step's `teach.json` lists that step's teachings — so the
 * teachings are the union over every step's file by decision id, in
 * first-seen order, and the i-th guidance item is the i-th teaching: an item
 * this reader could not read still counts toward the order, since the session
 * taught it too. A step's folder is named by its number (`stepDir`), which
 * the tasks file's steps are counted in.
 */
export async function readDump(dump: string): Promise<DumpRecord> {
  const stepsDir = join(dump, STEPS_DIR);
  const tasks = ((await readJson(join(dump, TASKS_FILE))) as DumpTask[] | null) ?? [];
  const items: DumpRecord['items'] = [];
  const unreadable: string[] = [];
  const teachings = new Map<string, StepTeaching>();
  for (const step of await dumpFolders(stepsDir)) {
    const fields = (await readJson(join(stepsDir, step, STEP_FILES.fields))) as StepFields | null;
    const openUnit = unitOpenAt(tasks, Number(step));
    (fields?.fields ?? []).forEach((field, position) => {
      const guidance = field.result?.guidance;
      if (guidance == null) return;
      const read = guidanceItemOf(
        guidance,
        { chosen: field.result?.chosen, via: field.result?.via },
        openUnit,
      );
      items.push(read.item);
      if (read.unreadable !== null) {
        unreadable.push(`step ${step}: field ${position + 1} — ${read.unreadable}`);
      }
    });
    const taught = (await readJson(join(stepsDir, step, STEP_FILES.teach))) as
      StepTeaching[] | null;
    for (const teaching of taught ?? []) teachings.set(teaching.decisionId, teaching);
  }
  const recorded = [...teachings.values()];
  const subject = recorded.map(subjectOf).find((named) => named !== null) ?? null;
  return { items, teachings: recorded, subject, unreadable };
}

/**
 * The answers one dump holds that the settings teach, each linked to its row
 * and to the orchestration the loop digested it on when the counts agree,
 * unlinked when they do not; the answers on a channel the settings keep
 * untaught are counted and left out.
 */
export function answersOf(
  record: DumpRecord,
  untaughtChannels: readonly string[],
): { answers: RecordedAnswer[]; linked: boolean; untaught: number } {
  const linked = record.items.length === record.teachings.length;
  let untaught = 0;
  const answers = record.items.flatMap((item, index) => {
    if (item === null) return [];
    if (untaughtChannels.includes(item.via)) {
      untaught += 1;
      return [];
    }
    const teaching = linked ? record.teachings[index] : undefined;
    return [
      {
        item,
        decisionId: teaching?.decisionId ?? null,
        earlierOrchestrationId: teaching === undefined ? null : orchestrationOf(teaching),
      },
    ];
  });
  return { answers, linked, untaught };
}
