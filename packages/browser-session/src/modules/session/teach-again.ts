import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DOCUMENT_MAX_MEMORIES,
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  fieldQuestionOf,
  guidanceDocument,
  operatorGuidanceSchema,
  renderDocumentGoal,
  SUGGESTION_BASES,
  type OperatorGuidanceDto,
  type SuggestionBasis,
} from '@sysdesign/contracts';
import { awaitOrchestration, type AwaitOptions, type LoopClient } from '@sysdesign/loop-client';

import { TEACH_ITERATIONS } from '../../adapters/loop-http/loop-brain';
import type { LedgerPort } from '../../core/ports';

/**
 * The operator answers a folder of session dumps recorded, taught again in
 * the canonical shape — the question as the key, the answer as the subject's,
 * the provenance kept apart — and the points their earlier digests stored
 * retracted once the new ones land. Everything read is declared data the
 * session wrote: each step's `fields.json` carries the guidance item as it was
 * taught (an older item under its label and context, a newer one under its
 * question) and `teach.json` the decision row and the orchestration each went
 * through, cumulative over the session. Answers are batched per session, as
 * many as one document may carry, so a record of a hundred answers is a
 * handful of digests, not a hundred.
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
  /** Dumps taught without their rows linked, or whose document stored nothing, with why. */
  skipped: string[];
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
 * answer was chosen from is the item's own, else the result's. Null for an
 * item that asked nothing it can be told by, which no probe could find again.
 */
export function guidanceItemOf(
  raw: Record<string, unknown>,
  chosen: unknown,
): OperatorGuidanceDto | null {
  const field = (raw['field'] ?? {}) as Record<string, unknown>;
  const label = typeof field['label'] === 'string' ? field['label'] : '';
  const context = typeof field['question'] === 'string' ? field['question'] : null;
  const question = fieldQuestionOf({ name: label, context });
  if (question === null) return null;
  const parsed = operatorGuidanceSchema.safeParse({
    sessionId: raw['sessionId'],
    capturedAt: raw['capturedAt'],
    field: { question, type: field['type'], options: field['options'] ?? null },
    context: raw['context'],
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

/**
 * Read one dump. A session taught one document per guidance item, in the
 * order the items settled, and `teach.json` is cumulative — so the teachings
 * are the union over every step's file by decision id, in first-seen order,
 * and the i-th guidance item is the i-th teaching.
 */
async function readDump(dump: string): Promise<DumpRecord> {
  const stepsDir = join(dump, '01-steps');
  const items: DumpRecord['items'] = [];
  const teachings = new Map<string, StepTeaching>();
  for (const step of await subdirectories(stepsDir)) {
    const fields = await readJson<StepFields>(join(stepsDir, step, 'fields.json'));
    for (const field of fields?.fields ?? []) {
      const guidance = field.result?.guidance;
      if (guidance == null) continue;
      // A keyless item still counts toward the order: the session taught it too.
      items.push(guidanceItemOf(guidance, field.result?.chosen));
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

const batches = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

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
    for (const batch of batches(answers, DOCUMENT_MAX_MEMORIES)) {
      const day = batch[0]?.item.capturedAt.slice(0, 10) ?? null;
      const document = guidanceDocument(
        sessionId,
        record.subject ?? deps.subject,
        batch.map((answer) => answer.item),
        day,
      );
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
      const kept = settled.steps['digest']?.counts['kept'] ?? 0;
      if (settled.steps['store']?.status !== 'complete' || kept === 0) {
        report.skipped.push(`${name}: document ${orchestrationRunId} stored nothing`);
        continue;
      }
      report.stored += kept;
      const decisionIds = batch.flatMap((answer) =>
        answer.decisionId === null ? [] : [answer.decisionId],
      );
      if (decisionIds.length > 0) await deps.ledger.recordTeaching(decisionIds, orchestrationRunId);
      // The new facts stand; only now do the earlier digests' points go.
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
