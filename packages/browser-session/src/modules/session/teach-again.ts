import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  fieldQuestionOf,
  guidanceDocuments,
  operatorGuidanceSchema,
  renderDocumentGoal,
  SUGGESTION_BASES,
  unitKeyOf,
  type BrowserTaskDto,
  type OperatorGuidanceDto,
  type SuggestionBasis,
} from '@sysdesign/contracts';
import { awaitOrchestration, type AwaitOptions, type LoopClient } from '@sysdesign/loop-client';

import { TEACH_ITERATIONS } from '../../adapters/loop-http/loop-brain';
import { SESSION_ENV, SESSION_FLAGS } from '../../config';
import type { LedgerPort } from '../../core/ports';
import { STEPS_DIR, TASKS_FILE } from '../../core/session-dump';
import { SessionRefused } from '../../core/unit-advice';

/**
 * The operator answers a folder of session dumps recorded, taught again in
 * the canonical shape — the question as the key, the answer as the subject's,
 * the provenance kept apart — and the points their earlier digests stored
 * retracted once the new ones land whole. Everything read is declared data the
 * session wrote: each step's `fields.json` carries the guidance item as it was
 * taught (an older item under its label and context, a newer one under its
 * question), `teach.json` the decision row and the orchestration each went
 * through, cumulative over the session, and `02-tasks.json` the units of work
 * and the steps each was open for — the unit an older item, recorded before
 * answers named theirs, was given in. Answers are batched per session and per
 * unit of work they were given in (`guidanceDocuments`), as many as one
 * document may carry, so a record of a hundred answers is a handful of
 * digests, not a hundred, and each names the unit its answers were given in.
 * A new digest that left facts out of the store — memories bound to a unit of
 * work, of answers given outside any — retracts nothing: the earlier digests
 * stand beside it, and the dump is named in `skipped`.
 */
export interface TeachAgainReport {
  dryRun: boolean;
  sessions: number;
  answers: number;
  documents: number;
  /** Facts the new digests kept, as their digest steps counted them. */
  stored: number;
  /** Earlier digest runs retracted after their answers were taught again. */
  retracted: number;
  /** Dump folders that recorded no operator answer: nothing to teach. */
  unanswered: number;
  /** Dumps taught without their rows linked, whose document stored nothing, or left facts out and retracted nothing, with why. */
  skipped: string[];
}

/**
 * Whom a dump's answers are about when its own teachings do not say: the name
 * given, else the configured one — and never the environment's placeholder,
 * which is refused by name. Measured 2026-10-13: six answers from before
 * teaching existed were stored about "the subject" because nothing named whom.
 */
export function subjectFor(given: string | undefined, configured: string): string {
  if (given !== undefined) return given;
  if (configured === SESSION_ENV.subject.fallback) {
    throw new SessionRefused(
      `teach-again needs the subject's name for a dump whose own teachings carry none: ${SESSION_FLAGS.subject.name} <name>, or ${SESSION_ENV.subject.name} in the environment`,
    );
  }
  return configured;
}

export interface TeachAgainDeps {
  client: LoopClient;
  ledger: Pick<LedgerPort, 'recordTeaching'>;
  /** Whom the answers are about when a dump's own teachings do not say. */
  subject: string;
  log: (text: string) => void;
  awaiting?: AwaitOptions;
}

/** One recorded answer: the item to teach, the row it came from and the orchestration it went through. */
interface RecordedAnswer {
  item: OperatorGuidanceDto;
  decisionId: string | null;
  earlierOrchestrationId: string | null;
}

interface StepFields {
  fields?: {
    result?: { guidance?: Record<string, unknown> | null; chosen?: string | null } | null;
  }[];
}

interface StepTeaching {
  decisionId: string;
  orchestrationRunId: string | null;
  document?: { subject?: string };
}

const suggestionBasisOf = (chosen: unknown): SuggestionBasis | null =>
  typeof chosen === 'string' && (SUGGESTION_BASES as readonly string[]).includes(chosen)
    ? (chosen as SuggestionBasis)
    : null;

/**
 * A recorded guidance item in today's shape. An older item carried `label`
 * (the field's name) and `question` (its context) and no `chosen`; the key is
 * what the field asked, as `fieldQuestionOf` reads both, and the basis the
 * answer was chosen from is the item's own, else the result's. An item
 * recorded before answers named their unit of work is given in the unit the
 * dump records open at its step (`openUnit`, null outside any); a newer one
 * names its own. Null for an item that asked nothing it can be told by, which
 * no probe could find again.
 */
export function guidanceItemOf(
  raw: Record<string, unknown>,
  chosen: unknown,
  openUnit: string | null,
): OperatorGuidanceDto | null {
  const field = (raw['field'] ?? {}) as Record<string, unknown>;
  const label = typeof field['label'] === 'string' ? field['label'] : '';
  const context = typeof field['question'] === 'string' ? field['question'] : null;
  const question = fieldQuestionOf({ name: label, context });
  if (question === null) return null;
  const given = (raw['context'] ?? {}) as Record<string, unknown>;
  const parsed = operatorGuidanceSchema.safeParse({
    sessionId: raw['sessionId'],
    capturedAt: raw['capturedAt'],
    field: { question, type: field['type'], options: field['options'] ?? null },
    context: { ...given, unitKey: Object.hasOwn(given, 'unitKey') ? given['unitKey'] : openUnit },
    answer: raw['answer'],
    chosen: suggestionBasisOf(raw['chosen'] ?? chosen),
  });
  return parsed.success ? (parsed.data as OperatorGuidanceDto) : null;
}

const readJson = async <T>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
};

const subdirectories = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/** What one dump folder recorded: its guidance items in step and field order — null for one that asks nothing it can be told by — and its teachings in the order they were made. */
interface DumpRecord {
  items: (OperatorGuidanceDto | null)[];
  teachings: StepTeaching[];
  subject: string | null;
}

/** A unit of work as the dump's tasks file records it: an older one carries no facets. */
type DumpTask = Pick<BrowserTaskDto, 'id' | 'startStep' | 'endStep'> &
  Partial<Pick<BrowserTaskDto, 'facets'>>;

/**
 * The unit of work the dump records open at a step, keyed as the session keys
 * one (`unitKeyOf`): the task whose steps cover it — null when none does, as
 * outside any unit or in a dump whose session never closed and wrote no tasks.
 */
function unitOpenAt(tasks: readonly DumpTask[], step: number): string | null {
  const task = tasks.find(
    (candidate) => candidate.startStep <= step && (candidate.endStep ?? Infinity) >= step,
  );
  return task === undefined ? null : unitKeyOf({ id: task.id, facets: task.facets ?? [] });
}

/**
 * Read one dump. A session taught one document per guidance item, in the
 * order the items settled, and `teach.json` is cumulative — so the teachings
 * are the union over every step's file by decision id, in first-seen order,
 * and the i-th guidance item is the i-th teaching. A step's folder is named
 * by its number (`stepDir`), which the tasks file's steps are counted in.
 */
async function readDump(dump: string): Promise<DumpRecord> {
  const stepsDir = join(dump, STEPS_DIR);
  const tasks = (await readJson<DumpTask[]>(join(dump, TASKS_FILE))) ?? [];
  const items: DumpRecord['items'] = [];
  const teachings = new Map<string, StepTeaching>();
  for (const step of await subdirectories(stepsDir)) {
    const fields = await readJson<StepFields>(join(stepsDir, step, 'fields.json'));
    const openUnit = unitOpenAt(tasks, Number(step));
    for (const field of fields?.fields ?? []) {
      const guidance = field.result?.guidance;
      if (guidance == null) continue;
      // A keyless item still counts toward the order: the session taught it too.
      items.push(guidanceItemOf(guidance, field.result?.chosen, openUnit));
    }
    for (const teaching of (await readJson<StepTeaching[]>(join(stepsDir, step, 'teach.json'))) ??
      []) {
      teachings.set(teaching.decisionId, teaching);
    }
  }
  const subject =
    [...teachings.values()].find((teaching) => teaching.document?.subject)?.document?.subject ??
    null;
  return { items, teachings: [...teachings.values()], subject };
}

/** The answers one dump holds, each linked to its row and orchestration when the counts agree, unlinked when they do not. */
function answersOf(record: DumpRecord): { answers: RecordedAnswer[]; linked: boolean } {
  const linked = record.items.length === record.teachings.length;
  const answers = record.items.flatMap((item, index) => {
    if (item === null) return [];
    const teaching = linked ? record.teachings[index] : undefined;
    return [
      {
        item,
        decisionId: teaching?.decisionId ?? null,
        earlierOrchestrationId: teaching?.orchestrationRunId ?? null,
      },
    ];
  });
  return { answers, linked };
}

/** The digest run an earlier teaching stored through, read off its orchestration; null when the loop no longer has it or it never digested. */
async function digestRunOf(client: LoopClient, orchestrationId: string): Promise<string | null> {
  const orchestration = await client.getOrchestration(orchestrationId);
  return orchestration?.steps['digest']?.runIds[0] ?? null;
}

export async function teachAgain(
  deps: TeachAgainDeps,
  dumpsDir: string,
  dryRun: boolean,
): Promise<TeachAgainReport> {
  const report: TeachAgainReport = {
    dryRun,
    sessions: 0,
    answers: 0,
    documents: 0,
    stored: 0,
    retracted: 0,
    unanswered: 0,
    skipped: [],
  };
  for (const name of await subdirectories(dumpsDir)) {
    const record = await readDump(join(dumpsDir, name));
    const { answers, linked } = answersOf(record);
    if (answers.length === 0) {
      report.unanswered += 1;
      continue;
    }
    if (!linked) {
      report.skipped.push(
        `${name}: ${record.items.length} answer(s) but ${record.teachings.length} teaching(s) — taught without linking rows or retracting`,
      );
    }
    report.sessions += 1;
    report.answers += answers.length;
    const sessionId = answers[0]?.item.sessionId ?? name;
    for (const { document, answers: batch } of guidanceDocuments(
      sessionId,
      record.subject ?? deps.subject,
      answers,
      (answer) => answer.item,
    )) {
      report.documents += 1;
      if (dryRun) continue;
      const { orchestrationRunId } = await deps.client.startOrchestration(
        DOCUMENT_MEMORY_ORCHESTRATOR_ID,
        {
          goal: renderDocumentGoal(document),
          maxIterations: TEACH_ITERATIONS,
          openedBy: { kind: 'browser-session', id: sessionId, label: 'taught again' },
        },
      );
      const settled = await awaitOrchestration(deps.client, orchestrationRunId, deps.awaiting);
      const digested = settled.steps['digest'];
      const kept = digested?.counts['kept'] ?? 0;
      if (settled.steps['store']?.status !== 'complete' || kept === 0) {
        report.skipped.push(`${name}: document ${orchestrationRunId} stored nothing`);
        continue;
      }
      report.stored += kept;
      const decisionIds = batch.flatMap((answer) =>
        answer.decisionId === null ? [] : [answer.decisionId],
      );
      if (decisionIds.length > 0) await deps.ledger.recordTeaching(decisionIds, orchestrationRunId);
      // A digest that stored and gave a reason left facts out: what the earlier digests stored stays.
      if (digested?.reason != null) {
        const why =
          digested.note === null ? digested.reason : `${digested.reason} — ${digested.note}`;
        report.skipped.push(
          `${name}: document ${orchestrationRunId} left facts out of the store (${why}); its earlier digests kept`,
        );
        continue;
      }
      // The new facts stand whole; only now do the earlier digests' points go.
      const earlier = new Set(
        batch.flatMap((answer) =>
          answer.earlierOrchestrationId === null ? [] : [answer.earlierOrchestrationId],
        ),
      );
      for (const orchestrationId of earlier) {
        const digestRunId = await digestRunOf(deps.client, orchestrationId);
        if (digestRunId === null) continue;
        await deps.client.retractMemory(digestRunId);
        report.retracted += 1;
      }
      deps.log(
        `${name}: ${batch.length} answer(s) taught again through ${orchestrationRunId}, ${kept} fact(s) kept`,
      );
    }
  }
  return report;
}
