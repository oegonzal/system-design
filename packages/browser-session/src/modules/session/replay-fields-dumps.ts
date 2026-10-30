import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  ADMISSIONS,
  ANSWER_BASES,
  BROWSER_DECISION_SOURCES,
  FIELD_ANSWER_PIPELINE_ID,
  FIELD_ROUTES,
  fieldQuestionOf,
  fieldSpecSchema,
  LANDMARK_ROLES,
  MEMORY_SCOPES,
  unitKeyOf,
  type Admission,
  type AnswerBasis,
  type BrowserDecisionSource,
  type FieldRoute,
  type FieldSpec,
  type MemoryScope,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import { z } from 'zod';

import type { FormTask } from '../../core/open-unit';
import {
  GOAL_FILE,
  MANIFEST_FILE,
  RUBRICS_FILE,
  STEP_FILES,
  STEPS_DIR,
  TASKS_FILE,
} from '../../core/session-dump';
import { dumpFolders, readJson, taskCoveringStep } from './recorded-answers';
import { KnownAnswers } from './replay-fields-measure';

/**
 * What a folder of session dumps recorded of its form pages, read back for
 * the replay — declared data the session wrote, read leniently by version:
 * each step's `fields.json` carries every routed field with the answerer's
 * say and what became of it, the run that answered them and the
 * orchestration that ran it when one did; `02-tasks.json` the units of work
 * and the steps each was open for, `00-rubrics.json` the rubric the session's
 * field runs were judged by, `goal.md` the mission and `manifest.json` the
 * session's id. A field or a file an older dump wrote in a shape this reader
 * does not know is named under `unreadable`, never guessed at.
 */

/** One recorded field: the page's facts, the answerer's say, and how the session routed it. */
export interface RecordedField {
  field: FieldSpec;
  /** What the field asked (`fieldQuestionOf`): the probe the recall searched with then and now; null when it asked nothing. */
  question: string | null;
  route: FieldRoute;
  source: BrowserDecisionSource;
  /** What was typed when the route was fill, what the field held when it was keep, the answerer's suggestion when a person was asked. */
  value: string | null;
  rests: AnswerBasis | null;
  /** Where the answerer declared an answer to the question holds; null for a field no artifact answered, or a dump from before the declaration. */
  about: MemoryScope | null;
  /** The evidence aliases the answerer's value rested on. */
  cited: readonly string[];
  /** What the operator's own answer put into the field at this step, when one did; null otherwise. */
  operatorAnswer: string | null;
}

/** One recorded form page: the fields, the run that answered them, and what the session knew around them. */
export interface RecordedStep {
  /** The dump folder's name. */
  dump: string;
  sessionId: string;
  step: number;
  runId: string | null;
  /** The orchestration that ran the recorded run, when one did — whose recall step the recorded latency is read off. */
  orchestrationRunId: string | null;
  admission: Admission | null;
  fields: RecordedField[];
  /** The unit of work the dump records open at the step, as the answerer was told it; null outside any. */
  task: FormTask | null;
  /** The mission the session ran, from the dump's goal file; null for a dump that never closed and wrote none. */
  mission: string | null;
  /** The rubric the session's field-answer runs were judged by; null for a dump without one. */
  criteria: readonly SuccessCriterion[] | null;
}

interface RecordedDumps {
  /** Every recorded form page, in dump then step order. */
  steps: RecordedStep[];
  /** The operator's answers on record, by unit of work and question, for a judged value to be held to. */
  knownAnswers: KnownAnswers;
  /** What the record holds that this reader could not read, each named by dump, step and ref. */
  unreadable: string[];
}

/** A text as the record wrote it, or null for anything else; a value past a string is read as absent, never as text. */
const text = z.string().nullable().catch(null);

const recordedResultSchema = z.object({
  route: z.enum(FIELD_ROUTES),
  source: z.enum(BROWSER_DECISION_SOURCES),
  value: text,
});

/** A routed field as `fields.json` records one, every field read beside the spec kept as it was written. */
const recordedFieldSchema = z.object({
  field: fieldSpecSchema,
  route: z.enum(FIELD_ROUTES),
  source: z.enum(BROWSER_DECISION_SOURCES),
  value: text,
  answer: z
    .object({
      rests: z.enum(ANSWER_BASES).nullable().catch(null),
      about: z.enum(MEMORY_SCOPES).nullable().catch(null),
      basis: z.array(z.string()).catch([]),
    })
    .nullable()
    .catch(null),
  result: recordedResultSchema.nullable().catch(null),
});

const stepFieldsSchema = z.object({
  runId: text,
  orchestrationRunId: text,
  admission: z.enum(ADMISSIONS).nullable().catch(null),
  fields: z.array(z.unknown()).catch([]),
});

/** A unit of work as the tasks file records it: an older row carries no facets, no reference and no statement. */
const dumpTaskSchema = z.object({
  id: z.string(),
  label: z.string().catch(''),
  externalRef: text,
  facets: z.array(z.object({ name: z.string(), value: z.string() })).catch([]),
  startStep: z.number().int(),
  endStep: z.number().int().nullable().catch(null),
  context: z
    .object({ landmark: z.enum(LANDMARK_ROLES), text: z.string(), omitted: z.number().int() })
    .nullable()
    .catch(null),
});
type DumpTask = z.infer<typeof dumpTaskSchema>;

const rubricsSchema = z.record(
  z.string(),
  z.object({
    criteria: z.array(z.object({ id: z.string(), kind: z.string(), statement: z.string() })),
  }),
);

const manifestSchema = z.object({ sessionId: z.string() });

const readText = (path: string): Promise<string | null> => readFile(path, 'utf8').catch(() => null);

/**
 * The unit of work the dump records open at a step, as a form goal is composed
 * for it: the task whose steps cover the step, keyed as the session keys one
 * (`unitKeyOf`), its reference as its URL and its statement as recorded; null
 * when none covers it — outside any unit, or in a dump that wrote no tasks.
 */
function taskOpenAt(tasks: readonly DumpTask[], step: number): FormTask | null {
  const task = taskCoveringStep(tasks, step);
  if (task === undefined) return null;
  return {
    label: task.label,
    url: task.externalRef ?? '',
    facets: task.facets,
    unitKey: unitKeyOf({ id: task.id, facets: task.facets }),
    context: task.context,
  };
}

/** The operator's own answer at this step: what the field was filled with when the operator was its source; null otherwise. */
const operatorAnswerOf = (result: z.infer<typeof recordedResultSchema> | null): string | null =>
  result !== null && result.source === 'operator' && result.route === 'fill' ? result.value : null;

function recordedFieldOf(raw: unknown): RecordedField | null {
  const parsed = recordedFieldSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { field, route, source, value, answer, result } = parsed.data;
  return {
    field,
    question: fieldQuestionOf(field),
    route,
    source,
    value,
    rests: answer?.rests ?? null,
    about: answer?.about ?? null,
    cited: answer?.basis ?? [],
    operatorAnswer: operatorAnswerOf(result),
  };
}

/** What one dump knew around its pages: the mission, the rubric for the field runs, the session's id and its units. */
async function readDumpContext(dump: string, name: string) {
  const rubrics = rubricsSchema.safeParse(await readJson(join(dump, RUBRICS_FILE)));
  const manifest = manifestSchema.safeParse(await readJson(join(dump, MANIFEST_FILE)));
  const tasks = z.array(dumpTaskSchema).safeParse(await readJson(join(dump, TASKS_FILE)));
  return {
    mission: await readText(join(dump, GOAL_FILE)),
    criteria: rubrics.success ? (rubrics.data[FIELD_ANSWER_PIPELINE_ID]?.criteria ?? null) : null,
    sessionId: manifest.success ? manifest.data.sessionId : name,
    tasks: tasks.success ? tasks.data : [],
  };
}

/**
 * Every form page a folder of session dumps recorded, with the operator's
 * answers on record by unit of work and question. A step folder is named by
 * its number, which the tasks file's steps are counted in; a step without a
 * fields file was no form page. The known answers are read in dump order, so
 * a question answered twice stands by its latest answer.
 */
export async function readRecordedDumps(sessionsDir: string): Promise<RecordedDumps> {
  const steps: RecordedStep[] = [];
  const knownAnswers = new KnownAnswers();
  const unreadable: string[] = [];
  for (const name of await dumpFolders(sessionsDir)) {
    const dump = join(sessionsDir, name);
    const context = await readDumpContext(dump, name);
    for (const stepName of await dumpFolders(join(dump, STEPS_DIR))) {
      const raw = await readJson(join(dump, STEPS_DIR, stepName, STEP_FILES.fields));
      if (raw === null) continue;
      const parsed = stepFieldsSchema.safeParse(raw);
      if (!parsed.success) {
        unreadable.push(`${name} step ${stepName}: ${STEP_FILES.fields}`);
        continue;
      }
      const step = Number(stepName);
      const task = taskOpenAt(context.tasks, step);
      const fields: RecordedField[] = [];
      parsed.data.fields.forEach((rawField, position) => {
        const field = recordedFieldOf(rawField);
        if (field === null) {
          unreadable.push(`${name} step ${stepName}: field ${position + 1}`);
          return;
        }
        fields.push(field);
        if (field.question !== null && field.operatorAnswer !== null) {
          knownAnswers.record(
            field.question,
            field.operatorAnswer,
            task?.unitKey ?? null,
            field.about,
          );
        }
      });
      steps.push({
        dump: name,
        sessionId: context.sessionId,
        step,
        runId: parsed.data.runId,
        orchestrationRunId: parsed.data.orchestrationRunId,
        admission: parsed.data.admission,
        fields,
        task,
        mission: context.mission,
        criteria: context.criteria,
      });
    }
  }
  return { steps, knownAnswers, unreadable };
}
