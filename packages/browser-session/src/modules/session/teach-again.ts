import { join } from 'node:path';

import {
  bestIterationOf,
  excerpt,
  guidanceDocuments,
  MEMORY_SCOPES,
  quoted,
  type MemoryScope,
} from '@sysdesign/contracts';
import { awaitOrchestration, type AwaitOptions, type LoopClient } from '@sysdesign/loop-client';
import { z } from 'zod';

import { SESSION_ENV, SESSION_FLAGS } from '../../config';
import type { BrainPort, LedgerPort, TeachReceipt } from '../../core/ports';
import { SessionRefused } from '../../core/unit-advice';
import { answersOf, dumpFolders, readDump, type RecordedAnswer } from './recorded-answers';

/**
 * The operator answers a folder of session dumps recorded (`recorded-answers`),
 * taught again through the brain as a session teaches them — the question as
 * the key, the answer as the subject's, the provenance kept apart. Answers are
 * batched per session and per unit of work they were given in
 * (`guidanceDocuments`), as many as one document may carry, so a record of a
 * hundred answers is a handful of teachings, not a hundred; each answer is its
 * own receipt, counted by its outcome and linked to its own row by the
 * reference the memory left. An answer recorded before answers declared their
 * scope takes the scope the digest of its earlier teaching gave its question,
 * while the loop still holds that run; one nothing declares a scope for is
 * left to the brain's rule, and counted. A brain that queues a document on
 * the loop is awaited there: the digests the earlier teachings stored through
 * are retracted once the new facts stand whole, and kept beside a digest that
 * left facts out of the store — memories bound to a unit of work, of answers
 * given outside any — with the dump named in `skipped`. A brain that writes
 * the answers itself answers each at once, and the same answers taught twice
 * come back `unchanged`. The operator settings' `untaught` holds here as it
 * does live: an answer recorded on a channel the list names — or on none — is
 * counted and left where it was.
 */
export interface TeachAgainReport {
  dryRun: boolean;
  sessions: number;
  answers: number;
  documents: number;
  /** Receipts by outcome, one per answer the brain was handed: what the memory did with each, in its own words. */
  outcomes: Record<string, number>;
  /**
   * Where each answer's scope came from: declared on the dump item; read off
   * the digest of its earlier teaching, which the loop still holds; or
   * nowhere, left to the brain's rule for an undeclared scope.
   */
  scopes: { declared: number; fromDigest: number; undeclared: number };
  /** Facts the loop's digests kept, as their digest steps counted them — of the documents the brain queued on the loop alone. */
  stored: number;
  /** Earlier digest runs retracted after their answers were taught again. */
  retracted: number;
  /** Dump folders that recorded no operator answer: nothing to teach. */
  unanswered: number;
  /** Answers recorded on a channel the operator settings do not teach: left where they were, taught again by nobody. */
  untaught: number;
  /** Recorded items this reader could not read, by dump, step and field: counted toward the teachings' order, taught by nobody. */
  unreadable: string[];
  /** Dumps taught without their rows linked, answers the memory refused, documents the loop stored nothing of, and digests that left facts out and retracted nothing, with why. */
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
  /** The brain the answers are taught through, as a session teaches them. */
  brain: Pick<BrainPort, 'teach'>;
  /** The loop: for the scope an earlier digest gave a question, and for the retraction tail — a document the brain queued there is awaited, and the digests the earlier teachings stored through retracted once it stands. */
  loop: LoopClient;
  ledger: Pick<LedgerPort, 'recordTeaching'>;
  /** Whom the answers are about when a dump's own teachings do not say. */
  subject: string;
  /** The channels whose answers are kept untaught, by the id each answer carries — the operator settings' `untaught`. */
  untaught: readonly string[];
  log: (text: string) => void;
  awaiting?: AwaitOptions;
}

/** Where a batch came from, as its report lines name it. */
interface BatchOrigin {
  name: string;
  sessionId: string;
  subject: string;
}

/** How much of a question a report line quotes. */
const QUESTION_QUOTED = 80;

/** The digest run an earlier teaching stored through, read off its orchestration; null when the loop no longer has it or it never digested. */
async function digestRunOf(loop: LoopClient, orchestrationId: string): Promise<string | null> {
  const orchestration = await loop.getOrchestration(orchestrationId);
  return orchestration?.steps['digest']?.runIds[0] ?? null;
}

/**
 * What a digest's artifact declares of each memory it proposed: the question
 * it applies to — the digest was told to quote the question as its
 * `appliesWhen` — and the scope. Read by the shape alone; an artifact of any
 * other shape declares no scope for anything.
 */
const digestScopesSchema = z.object({
  memories: z.array(z.object({ appliesWhen: z.string(), scope: z.enum(MEMORY_SCOPES) })),
});

/**
 * The scope the digest of an earlier teaching gave each question it kept,
 * read once per orchestration while the loop still holds the run; a run the
 * loop no longer has, or that never digested, declares no scope.
 */
class DigestScopes {
  private readonly read = new Map<string, Promise<ReadonlyMap<string, MemoryScope>>>();

  constructor(private readonly loop: LoopClient) {}

  of(orchestrationId: string): Promise<ReadonlyMap<string, MemoryScope>> {
    const known = this.read.get(orchestrationId);
    if (known !== undefined) return known;
    const reading = this.scopesOf(orchestrationId);
    this.read.set(orchestrationId, reading);
    return reading;
  }

  private async scopesOf(orchestrationId: string): Promise<ReadonlyMap<string, MemoryScope>> {
    const digestRunId = await digestRunOf(this.loop, orchestrationId);
    const run = digestRunId === null ? null : await this.loop.getRun(digestRunId);
    const parsed = digestScopesSchema.safeParse(
      run === null ? null : bestIterationOf(run)?.artifact,
    );
    if (!parsed.success) return new Map();
    return new Map(parsed.data.memories.map((memory) => [memory.appliesWhen, memory.scope]));
  }
}

/**
 * Each answer under the scope the record declares for it: the item's own;
 * else, for an answer whose earlier digest the loop still holds, the scope
 * that digest gave its question; else none — left to the brain's rule for an
 * undeclared scope, and counted. A dry run reads no digest.
 */
async function scopedAnswers(
  digests: DigestScopes | null,
  answers: readonly RecordedAnswer[],
  report: TeachAgainReport,
): Promise<RecordedAnswer[]> {
  const scoped: RecordedAnswer[] = [];
  for (const answer of answers) {
    if (answer.item.about !== null) {
      report.scopes.declared += 1;
      scoped.push(answer);
      continue;
    }
    const fromDigest =
      digests === null || answer.earlierOrchestrationId === null
        ? undefined
        : (await digests.of(answer.earlierOrchestrationId)).get(answer.item.field.question);
    if (fromDigest === undefined) {
      report.scopes.undeclared += 1;
      scoped.push(answer);
      continue;
    }
    report.scopes.fromDigest += 1;
    scoped.push({ ...answer, item: { ...answer.item, about: fromDigest } });
  }
  return scoped;
}

/** What the loop made of a document the brain queued there: whether the store took its facts, how many the digest kept, and the reason it gave for leaving any out. */
async function awaitDigest(
  deps: TeachAgainDeps,
  orchestrationRunId: string,
): Promise<{ stored: boolean; kept: number; leftOut: string | null }> {
  const settled = await awaitOrchestration(deps.loop, orchestrationRunId, deps.awaiting);
  const digested = settled.steps['digest'];
  const kept = digested?.counts['kept'] ?? 0;
  return {
    stored: settled.steps['store']?.status === 'complete' && kept > 0,
    kept,
    leftOut:
      digested?.reason == null
        ? null
        : digested.note === null
          ? digested.reason
          : `${digested.reason} — ${digested.note}`,
  };
}

/** The reference onto the rows of the answers that have one. */
async function linkRows(
  deps: TeachAgainDeps,
  answers: readonly RecordedAnswer[],
  ref: string,
): Promise<void> {
  const decisionIds = answers.flatMap((answer) =>
    answer.decisionId === null ? [] : [answer.decisionId],
  );
  if (decisionIds.length > 0) await deps.ledger.recordTeaching(decisionIds, ref);
}

/**
 * A document the brain queued on the loop, settled there: its facts counted
 * once the store took them, the rows linked to the orchestration, and the
 * earlier digests retracted only when the new digest left nothing out. A
 * digest that stored nothing links and retracts nothing; one that stored and
 * gave a reason left facts out, and what the earlier digests stored stays.
 */
async function settleOnLoop(
  deps: TeachAgainDeps,
  report: TeachAgainReport,
  where: string,
  orchestrationRunId: string,
  batch: readonly RecordedAnswer[],
): Promise<void> {
  const digest = await awaitDigest(deps, orchestrationRunId);
  if (!digest.stored) {
    report.skipped.push(`${where} — document ${orchestrationRunId} stored nothing`);
    return;
  }
  report.stored += digest.kept;
  await linkRows(deps, batch, orchestrationRunId);
  if (digest.leftOut !== null) {
    report.skipped.push(
      `${where} — document ${orchestrationRunId} left facts out of the store (${digest.leftOut}); its earlier digests kept`,
    );
    return;
  }
  // The new facts stand whole; only now do the earlier digests' points go.
  const earlier = new Set(
    batch.flatMap((answer) =>
      answer.earlierOrchestrationId === null ? [] : [answer.earlierOrchestrationId],
    ),
  );
  for (const orchestrationId of earlier) {
    const digestRunId = await digestRunOf(deps.loop, orchestrationId);
    if (digestRunId === null) continue;
    await deps.loop.retractMemory(digestRunId);
    report.retracted += 1;
  }
  deps.log(`${where} taught again through ${orchestrationRunId}, ${digest.kept} fact(s) kept`);
}

/** The answers of a batch by the reference their receipts share, in first-seen order. */
function byRef(
  batch: readonly RecordedAnswer[],
  receipts: readonly TeachReceipt[],
  taking: (receipt: TeachReceipt) => boolean,
): Map<string, RecordedAnswer[]> {
  const grouped = new Map<string, RecordedAnswer[]>();
  receipts.forEach((receipt, index) => {
    const answer = batch[index];
    if (answer === undefined || receipt.ref === null || !taking(receipt)) return;
    grouped.set(receipt.ref, [...(grouped.get(receipt.ref) ?? []), answer]);
  });
  return grouped;
}

/**
 * One batch handed to the brain as one teaching from step 0 of its session,
 * each answer's receipt counted by outcome. A refused answer is named with its
 * question and links nothing; an answer queued on the loop is settled there
 * with the others its document carried; an answer the memory wrote is linked
 * to its row by the reference it left — its own record, never another's.
 */
async function teachBatch(
  deps: TeachAgainDeps,
  report: TeachAgainReport,
  origin: BatchOrigin,
  batch: readonly RecordedAnswer[],
): Promise<void> {
  const receipts = await deps.brain.teach(
    batch.map((answer) => answer.item),
    { sessionId: origin.sessionId, step: 0 },
    origin.subject,
  );
  if (receipts.length !== batch.length) {
    throw new Error(
      `the brain answered ${receipts.length} receipt(s) for ${batch.length} answer(s)`,
    );
  }
  const written: string[] = [];
  receipts.forEach((receipt, index) => {
    report.outcomes[receipt.outcome] = (report.outcomes[receipt.outcome] ?? 0) + 1;
    const question = quoted(excerpt(batch[index]?.item.field.question ?? '', QUESTION_QUOTED));
    if (receipt.outcome === 'refused') {
      report.skipped.push(
        `${origin.name}: ${question} refused by the memory — ${receipt.fault ?? 'no reason given'}`,
      );
    } else if (receipt.ref === null) {
      report.skipped.push(
        `${origin.name}: ${question} ${receipt.outcome} with no reference to link`,
      );
    } else if (receipt.outcome !== 'queued') {
      written.push(`${receipt.outcome} ${receipt.ref}`);
    }
  });
  for (const [ref, answers] of byRef(batch, receipts, (one) => one.outcome !== 'queued')) {
    await linkRows(deps, answers, ref);
  }
  if (written.length > 0) {
    deps.log(`${origin.name}: ${written.length} answer(s) taught again — ${written.join(', ')}`);
  }
  for (const [ref, answers] of byRef(batch, receipts, (one) => one.outcome === 'queued')) {
    await settleOnLoop(deps, report, `${origin.name}: ${answers.length} answer(s)`, ref, answers);
  }
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
    outcomes: {},
    scopes: { declared: 0, fromDigest: 0, undeclared: 0 },
    stored: 0,
    retracted: 0,
    unanswered: 0,
    untaught: 0,
    unreadable: [],
    skipped: [],
  };
  const digests = dryRun ? null : new DigestScopes(deps.loop);
  for (const name of await dumpFolders(dumpsDir)) {
    const record = await readDump(join(dumpsDir, name));
    report.unreadable.push(...record.unreadable.map((line) => `${name}: ${line}`));
    const { answers, linked, untaught } = answersOf(record, deps.untaught);
    report.untaught += untaught;
    if (answers.length === 0) {
      if (untaught === 0) report.unanswered += 1;
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
    const subject = record.subject ?? deps.subject;
    const scoped = await scopedAnswers(digests, answers, report);
    for (const { answers: batch } of guidanceDocuments(
      sessionId,
      subject,
      scoped,
      (answer) => answer.item,
    )) {
      report.documents += 1;
      if (dryRun) continue;
      await teachBatch(deps, report, { name, sessionId, subject }, batch);
    }
  }
  return report;
}
