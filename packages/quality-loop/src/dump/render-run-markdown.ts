/** `run.md`: the human entry point of a dump — what happened, in order, in one screen. */
import type { IterationTrace, RunTrace } from '@sysdesign/contracts';

import type { RunRecord } from '../core/contracts';

/** The manifest fields the page repeats. */
export interface RunHeadline {
  status: string;
  durationMs: number;
  finalDecision: string | null;
  stopReason: string | null;
}

const iterationRow = (iteration: IterationTrace<unknown>): string => {
  const { ledger, decision } = iteration;
  const assessed = ledger.criteria.filter((evidence) => evidence.result !== 'unassessed').length;
  return `| ${iteration.iteration} | ${iteration.mode} | ${decision.finalDecision} | ${decision.scores.overall} | ${assessed}/${ledger.criteria.length} | ${ledger.findings.length} | ${decision.reason} |`;
};

/** The verdict, every iteration as a row, and the last iteration's dimensions. */
function traceSection(trace: RunTrace): string[] {
  const last = trace.iterations[trace.iterations.length - 1];
  return [
    `**${trace.finalDecision}** (stopped: ${trace.stopReason}) · overall ${last.decision.scores.overall}/100 · best iteration ${trace.bestIteration}`,
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
    ...last.decision.trace.dimensions.map(
      (dimension) =>
        `| ${dimension.dimension} | ${dimension.score ?? '—'} | ${dimension.base ?? '—'} | ${dimension.penalties.length} (−${dimension.penaltyTotal}) | ${dimension.weight ?? '—'} |`,
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

/** One line per exchange, or the reason there were none. */
function modelCallsSection(record: RunRecord): string[] {
  if (record.exchanges.length === 0) return [`None — no stage reached the model.`, ``];
  return [
    ...record.exchanges.map(
      (exchange) =>
        `- \`${exchange.scope}\` #${exchange.ordinal} — ${exchange.outcome}, ${exchange.durationMs} ms${exchange.usage ? `, ${exchange.usage.inputTokens} in / ${exchange.usage.outputTokens} out` : ''}`,
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
  ];
  if (trace) {
    lines.push(...traceSection(trace), ...diagnosticsSection(trace), ...lessonsSection(trace));
  }
  if (record.error) {
    lines.push(`## Failed`, ``, '```', record.error.message, '```', ``);
  }
  lines.push(`## Model calls`, ``, ...modelCallsSection(record));
  return lines.join('\n');
}
