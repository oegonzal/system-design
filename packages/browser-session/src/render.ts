import { excerpt } from '@sysdesign/contracts';
import type {
  BrowserDecisionDto,
  BrowserSessionDetailDto,
  BrowserSessionDto,
  BrowserTaskDto,
} from '@sysdesign/contracts';

import { causeOf } from './core/ports';
import type { SessionOutcome } from './core/session-engine';
import { isLive } from './core/liveness';
import type { ReplayFieldsReport } from './modules/session/replay-fields';
import type { TeachAgainReport } from './modules/session/teach-again';

/**
 * stdout for humans. Fixed-width tables built with padEnd — no dependency —
 * and `--json` prints the records untouched for anything else. A running
 * session is shown live or stale by its heartbeat against the declared
 * window, never by its status alone.
 */
function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((title, index) =>
    Math.max(title.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join('  ')
      .trimEnd();
  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join(
    '\n',
  );
}

/** `running` as the beat says: live within the window, stale past it; a finished session is its status. */
export function liveness(
  session: Pick<BrowserSessionDto, 'status' | 'heartbeatAt'>,
  now: Date,
  staleAfterMs: number,
): string {
  if (session.status !== 'running') return session.status;
  return isLive(session.heartbeatAt, now, staleAfterMs) ? 'running (live)' : 'running (stale)';
}

const minutes = (from: string, to: string): string =>
  `${((Date.parse(to) - Date.parse(from)) / 60_000).toFixed(1)} min`;

export function renderSessions(
  sessions: readonly BrowserSessionDto[],
  now: Date,
  staleAfterMs: number,
): string {
  if (sessions.length === 0) return 'no sessions yet';
  return table(
    ['id', 'started', 'status', 'ended by', 'steps', 'profile', 'goal', 'duration'],
    sessions.map((session) => [
      session.id,
      session.startedAt,
      liveness(session, now, staleAfterMs),
      session.terminationCause ?? session.terminationReason ?? '',
      String(session.steps),
      session.profile,
      session.goalPath,
      minutes(session.startedAt, session.finishedAt ?? session.heartbeatAt),
    ]),
  );
}

/** A unit's identity as the table shows it: `company=Acme`, each declared fact in turn. */
const identityCell = (task: BrowserTaskDto): string =>
  task.facets.map((facet) => `${facet.name}=${facet.value}`).join(' · ');

const taskRows = (tasks: readonly BrowserTaskDto[]): string =>
  tasks.length === 0
    ? 'no units of work'
    : table(
        ['#', 'label', 'identity', 'status', 'outcome', 'steps', 'ref'],
        tasks.map((task) => [
          String(task.ordinal),
          excerpt(task.label, 48),
          excerpt(identityCell(task), 40),
          task.status,
          task.outcome ?? '',
          `${task.startStep}${task.endStep === null ? '…' : `–${task.endStep}`}`,
          task.externalRef ?? '',
        ]),
      );

const decisionRows = (decisions: readonly BrowserDecisionDto[]): string =>
  decisions.length === 0
    ? 'no decisions'
    : table(
        ['step', 'kind', 'source', 'run', 'ref', 'question', 'answer', 'rests', 'taught'],
        decisions.map((decision) => [
          `${decision.step}.${decision.ordinal}`,
          decision.kind,
          decision.source,
          decision.loopRunId ?? '',
          decision.ref ?? '',
          excerpt(decision.question ?? '', 40),
          excerpt(decision.answer ?? '', 32),
          decision.rests ?? '',
          decision.teachingRef ?? '',
        ]),
      );

export function renderSession(
  detail: BrowserSessionDetailDto,
  now: Date,
  staleAfterMs: number,
): string {
  const ended =
    detail.terminationReason === null
      ? ''
      : ` · ended by ${endedBy(detail.terminationReason, detail.terminationCause)}${detail.terminationDetail ? `: ${detail.terminationDetail}` : ''}`;
  return [
    `session ${detail.id} · ${liveness(detail, now, staleAfterMs)}${ended}`,
    `goal ${detail.goalPath} (${detail.goalHash.slice(0, 12)}) · profile ${detail.profile}${
      detail.subject === null ? '' : ` · subject ${detail.subject}`
    } · ${detail.headed ? 'headed' : 'headless'} · ${detail.steps} step(s) · dump ${detail.dumpRunId}`,
    `rails: ${detail.limits.maxTasks} tasks · ${detail.limits.maxMinutes} min${
      detail.limits.unitGraceMinutes > 0
        ? ` + ${detail.limits.unitGraceMinutes} for an open unit`
        : ''
    } · ${detail.limits.maxConsecutiveFailures} failures · ${detail.limits.maxBrainFaults} brain faults${
      detail.limits.targetDone === null ? '' : ` · target ${detail.limits.targetDone} done`
    }`,
    ...(detail.error === null ? [] : [`error: ${detail.error.name}: ${detail.error.message}`]),
    '',
    taskRows(detail.tasks),
    '',
    decisionRows(detail.decisions),
  ].join('\n');
}

export function renderOutcome(outcome: SessionOutcome): string {
  const ended = endedBy(outcome.termination.reason, causeOf(outcome.termination));
  return `session ${outcome.sessionId} ${outcome.status} after ${outcome.steps} step(s) — ${ended}: ${outcome.termination.detail}\ndump ${outcome.dumpRunId}`;
}

/** What ended a session, in words: the mission's stop by its cause word, or the engine's own reason. */
function endedBy(reason: string, cause: string | null): string {
  return cause === null ? reason : `the mission's stop ${cause}`;
}

/** The receipts by outcome, in the memory's words: "inserted 3 · unchanged 2"; none when no document was taught. */
const outcomesCell = (outcomes: Record<string, number>): string =>
  Object.entries(outcomes)
    .map(([outcome, count]) => `${outcome} ${count}`)
    .join(' · ');

/** Where the answers' scopes came from, counted: "scopes: 120 declared · 40 from the earlier digests · 9 undeclared"; nothing when no answer was read. */
const scopesLine = (scopes: TeachAgainReport['scopes']): string | null =>
  scopes.declared + scopes.fromDigest + scopes.undeclared === 0
    ? null
    : `scopes: ${scopes.declared} declared · ${scopes.fromDigest} from the earlier digests · ${scopes.undeclared} undeclared, left to the brain's rule`;

/**
 * One line for what `teach-again` did, or would do: the receipts by outcome,
 * one per answer, where the answers' scopes came from, what the loop's
 * digests kept and retracted only when a document was queued there, the dumps
 * that held no answer, the answers left untaught and the items this build
 * could not read counted, and what was skipped named.
 */
export function renderTeachAgain(report: TeachAgainReport): string {
  const head = `${report.answers} answer(s) in ${report.sessions} session(s)`;
  const tail = [
    scopesLine(report.scopes),
    report.unanswered === 0 ? null : `${report.unanswered} dump(s) held no answer`,
    report.untaught === 0
      ? null
      : `${report.untaught} answer(s) on a channel the operator settings do not teach, left as they were`,
    report.unreadable.length === 0
      ? null
      : `${report.unreadable.length} recorded item(s) this build could not read: ${report.unreadable.join(', ')}`,
    ...report.skipped,
  ]
    .filter((note): note is string => note !== null)
    .map((note) => `; ${note}`)
    .join('');
  if (report.dryRun) {
    return `${head} would be taught again as ${report.documents} document(s); nothing was posted${tail}`;
  }
  const outcomes =
    Object.keys(report.outcomes).length === 0 ? 'none taught' : outcomesCell(report.outcomes);
  const digested =
    (report.outcomes['queued'] ?? 0) === 0
      ? ''
      : ` — ${report.stored} fact(s) kept by the loop's digests, ${report.retracted} earlier digest(s) retracted`;
  return `${head} taught again as ${report.documents} document(s): ${outcomes}${digested}${tail}`;
}

/** A part of a whole as the replay lines say it: "248 of 261 (95.0%)", or that nothing was there to count. */
const shareOf = (part: number, whole: number, none: string): string =>
  whole === 0 ? none : `${part} of ${whole} (${((100 * part) / whole).toFixed(1)}%)`;

const millis = (value: number | null): string =>
  value === null ? 'n/a' : `${Math.round(value)} ms`;

/** The retraction measure in one line: what was closed, what came back, what the lineage showed, what the host refused. */
const retractionLine = (retraction: ReplayFieldsReport['retraction']): string =>
  retraction === null
    ? 'retraction: not measured'
    : `retraction: ${retraction.sampled} closed · ${retraction.recalledAfter} recalled after · ${retraction.lineageShown} shown closed by history${retraction.faults.length === 0 ? '' : ` · ${retraction.faults.length} refused`}`;

/** The acceptance table's numbers for one replay, a line each, and where the rows and the report landed. */
export function renderReplayFields(report: ReplayFieldsReport): string {
  const judged =
    report.judged === null
      ? 'judged: nothing'
      : `judged: ${report.judged.filled} filled · ${report.judged.asked} asked · ${report.judged.wrong} wrong`;
  const { citedBy } = report;
  return [
    `${report.fields} field(s) over ${report.pages} page(s) replayed`,
    `cited evidence found again: ${shareOf(report.citedFound, report.cited, 'nothing was cited')}`,
    `found by: ${citedBy.equal} the same words · ${citedBy.identity} the same identity · ${citedBy.contained} the fact's words contained`,
    `leaks: ${report.unitLeak} unit · ${report.tenantLeak} tenant`,
    `recall latency per page: p50 ${millis(report.latency.p50)} · p90 ${millis(report.latency.p90)} — recorded p50 ${millis(report.recordedLatency.p50)} · p90 ${millis(report.recordedLatency.p90)}`,
    judged,
    retractionLine(report.retraction),
    ...(report.unresolvedRuns === 0
      ? []
      : [
          `${report.unresolvedRuns} recorded run(s) the loop no longer holds: their cited evidence was not compared`,
        ]),
    ...(report.unresolvedOrchestrations === 0
      ? []
      : [
          `${report.unresolvedOrchestrations} recorded orchestration(s) the loop no longer holds: their recall latency was not read`,
        ]),
    `rows and report under ${report.outDir}`,
  ].join('\n');
}
