/** `run.md`: the human entry point of a dump — what happened, in order, in one screen. */
import { markdownCell, type IterationTrace, type RunTrace } from '@sysdesign/contracts';

import type { RunRecord } from '../core/contracts';

/** The manifest fields the page repeats. */
export interface RunHeadline {
  status: string;
  durationMs: number;
  finalDecision: string | null;
  stopReason: string | null;
}

/** One table row, every cell escaped: a reason quoting a finding key (`type|refs`) must not open a column. */
const row = (cells: readonly (string | number | null)[]): string =>
  `| ${cells.map((value) => markdownCell(String(value ?? '—'))).join(' | ')} |`;

const iterationRow = (iteration: IterationTrace<unknown>): string => {
  const { ledger, decision } = iteration;
  const assessed = ledger.criteria.filter((evidence) => evidence.result !== 'unassessed').length;
  return row([
    iteration.iteration,
    iteration.mode,
    decision.finalDecision,
    decision.scores.overall,
    `${assessed}/${ledger.criteria.length}`,
    ledger.findings.length,
    decision.reason,
  ]);
};

/**
 * Why the loop stopped — or, with no stop reason, how the run ended without
 * one: still running, or failed after the iterations below were recorded.
 */
const stoppedLine = (trace: RunTrace, status: string): string =>
  trace.stopReason !== null ? `stopped: ${trace.stopReason}` : `${status}, no stop reason`;

/** The verdict, every iteration as a row, and the last iteration's dimensions. */
function traceSection(trace: RunTrace, status: string): string[] {
  const last = trace.iterations[trace.iterations.length - 1];
  const stopped = stoppedLine(trace, status);
  return [
    `**${trace.finalDecision}** (${stopped}) · overall ${last.decision.scores.overall}/100 · best iteration ${trace.bestIteration}`,
    ``,
    `## Iterations`,
    ``,
    `| # | mode | decision | overall | criteria assessed | findings | reason |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    ...trace.iterations.map(iterationRow),
    ``,
    `## Dimensions (last iteration)`,
    ``,
    `| dimension | score | base | penalties | weight |`,
    `| --- | --- | --- | --- | --- |`,
    ...last.decision.trace.dimensions.map((dimension) =>
      row([
        dimension.dimension,
        dimension.score,
        dimension.base,
        `${dimension.penalties.length} (−${dimension.penaltyTotal})`,
        dimension.weight,
      ]),
    ),
    ``,
  ];
}

/** Every stage that could not do its work, across iterations; nothing when every stage did. */
function diagnosticsSection(trace: RunTrace): string[] {
  const diagnostics = trace.iterations.flatMap((iteration) => iteration.ledger.diagnostics);
  if (diagnostics.length === 0) return [];
  return [
    `## Diagnostics`,
    ``,
    ...diagnostics.map(
      (diagnostic) =>
        `- \`${diagnostic.stage}\`${diagnostic.sample ? ` #${diagnostic.sample}` : ''} — ${diagnostic.reason}${diagnostic.detail ? `: ${diagnostic.detail}` : ''}`,
    ),
    ``,
  ];
}

function lessonsSection(trace: RunTrace): string[] {
  if (trace.lessons.length === 0) return [];
  return [
    `## Lessons`,
    ``,
    ...trace.lessons.map(
      (lesson) =>
        `- ${lesson.kind} \`${lesson.subject}\` (${lesson.iterations.join('→')}): ${lesson.detail}`,
    ),
    ``,
  ];
}

/**
 * What the run recalled for its producer, and the lessons the producer saw —
 * the curator's words, each with the run it came from. Nothing when the run
 * did not ask to recall.
 */
function recallSection(record: RunRecord): string[] {
  const { recall } = record;
  if (recall === null) return [];
  const why =
    recall.reason === null ? '' : ` (${recall.reason}${recall.note ? `: ${recall.note}` : ''})`;
  const from = recall.recallRunId === null ? '' : ` · recall run ${recall.recallRunId}`;
  return [
    `## Recall`,
    ``,
    `${recall.status}${why} · ${recall.count} lesson(s) handed to the producer${from}`,
    ``,
    ...recall.lessons.map(
      (lesson) =>
        `- [${lesson.ref}] ${lesson.insight} — serves: ${lesson.serves}${lesson.caveat ? `; caveat: ${lesson.caveat}` : ''} (from run ${lesson.sourceRunId})`,
    ),
    ...(recall.lessons.length > 0 ? [``] : []),
  ];
}

/** One line per exchange — with the recorded reason when it failed — or the reason there were none. */
function modelCallsSection(record: RunRecord): string[] {
  if (record.exchanges.length === 0) return [`None — no stage reached the model.`, ``];
  return [
    ...record.exchanges.map(
      (exchange) =>
        `- \`${exchange.scope}\` #${exchange.ordinal} — ${exchange.outcome}, ${exchange.durationMs} ms${exchange.usage ? `, ${exchange.usage.inputTokens} in / ${exchange.usage.outputTokens} out` : ''}${exchange.error ? ` — ${exchange.error.name}: ${exchange.error.message.replace(/\s+/g, ' ').trim()}` : ''}`,
    ),
    ``,
  ];
}

export function renderRunMarkdown(record: RunRecord, headline: RunHeadline): string {
  const { trace } = record;
  const lines: string[] = [
    `# Quality-loop run ${record.runId}`,
    ``,
    `${record.finishedAt ?? record.startedAt} · ${headline.status} · ${headline.durationMs} ms · pipeline ${record.pipeline}`,
    ``,
    ...(record.parentRunId === null ? [] : [`Opened for run ${record.parentRunId}.`, ``]),
    ...recallSection(record),
  ];
  if (trace) {
    lines.push(
      ...traceSection(trace, headline.status),
      ...diagnosticsSection(trace),
      ...lessonsSection(trace),
    );
  }
  if (record.error) {
    lines.push(`## Failed`, ``, '```', record.error.message, '```', ``);
  }
  lines.push(`## Model calls`, ``, ...modelCallsSection(record));
  return lines.join('\n');
}
