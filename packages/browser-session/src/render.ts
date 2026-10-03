import type {
  BrowserDecisionDto,
  BrowserSessionDetailDto,
  BrowserSessionDto,
  BrowserTaskDto,
} from '@sysdesign/contracts';

import type { SessionOutcome } from './core/session-engine';
import { clip } from './core/text';
import { isLive, SESSION_STALE_AFTER_MS } from './core/write-queue';

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
  staleAfterMs = SESSION_STALE_AFTER_MS,
): string {
  if (session.status !== 'running') return session.status;
  return isLive(session.heartbeatAt, now, staleAfterMs) ? 'running (live)' : 'running (stale)';
}

const minutes = (from: string, to: string): string =>
  `${((Date.parse(to) - Date.parse(from)) / 60_000).toFixed(1)} min`;

export function renderSessions(sessions: readonly BrowserSessionDto[], now: Date): string {
  if (sessions.length === 0) return 'no sessions yet';
  return table(
    ['id', 'started', 'status', 'ended by', 'steps', 'profile', 'goal', 'duration'],
    sessions.map((session) => [
      session.id,
      session.startedAt,
      liveness(session, now),
      session.terminationReason ?? '',
      String(session.steps),
      session.profile,
      session.goalPath,
      minutes(session.startedAt, session.finishedAt ?? session.heartbeatAt),
    ]),
  );
}

const taskRows = (tasks: readonly BrowserTaskDto[]): string =>
  tasks.length === 0
    ? 'no units of work'
    : table(
        ['#', 'label', 'status', 'outcome', 'steps', 'ref'],
        tasks.map((task) => [
          String(task.ordinal),
          clip(task.label, 48),
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
        ['step', 'kind', 'source', 'run', 'ref', 'question', 'answer', 'conf', 'taught'],
        decisions.map((decision) => [
          `${decision.step}.${decision.ordinal}`,
          decision.kind,
          decision.source,
          decision.loopRunId ?? '',
          decision.ref ?? '',
          clip(decision.question ?? '', 40),
          clip(decision.answer ?? '', 32),
          decision.confidence ?? '',
          decision.teachOrchestrationId ?? '',
        ]),
      );

export function renderSession(detail: BrowserSessionDetailDto, now: Date): string {
  const ended =
    detail.terminationReason === null
      ? ''
      : ` · ended by ${detail.terminationReason}${detail.terminationDetail ? `: ${detail.terminationDetail}` : ''}`;
  return [
    `session ${detail.id} · ${liveness(detail, now)}${ended}`,
    `goal ${detail.goalPath} (${detail.goalHash.slice(0, 12)}) · profile ${detail.profile} · ${
      detail.headed ? 'headed' : 'headless'
    } · ${detail.steps} step(s) · dump ${detail.dumpRunId}`,
    `rails: ${detail.limits.maxTasks} tasks · ${detail.limits.maxMinutes} min · ${detail.limits.maxConsecutiveFailures} failures · ${detail.limits.maxBrainFaults} brain faults`,
    ...(detail.error === null ? [] : [`error: ${detail.error.name}: ${detail.error.message}`]),
    '',
    taskRows(detail.tasks),
    '',
    decisionRows(detail.decisions),
  ].join('\n');
}

export function renderOutcome(outcome: SessionOutcome): string {
  return `session ${outcome.sessionId} ${outcome.status} after ${outcome.steps} step(s) — ${outcome.termination.reason}: ${outcome.termination.detail}\ndump ${outcome.dumpRunId}`;
}
