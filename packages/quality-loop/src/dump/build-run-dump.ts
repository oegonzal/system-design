/**
 * The run dump: everything one run saw, said and decided. Pure — the layout is
 * decided here and written by `@sysdesign/run-dump`, so it can be tested
 * without a filesystem. The layout IS the contract future analysis reads.
 *
 * NOTE FOR READERS: these files contain the goal and the model's prose verbatim.
 */
import type { IterationTrace, PipelineSummary } from '@sysdesign/contracts';
import {
  capText,
  DUMP_SCHEMA_VERSION,
  jsonSafe,
  type BuiltDump,
  type DumpFile,
} from '@sysdesign/run-dump';

import type { RunRecord } from '../core/contracts';

const json = (value: unknown): string => `${JSON.stringify(jsonSafe(value), null, 2)}\n`;
const pad = (value: number): string => String(value).padStart(2, '0');

const withTruncationNote = (capped: ReturnType<typeof capText>): string =>
  capped.truncated
    ? `${capped.text}\n\n[truncated — original was ${capped.originalBytes} bytes]\n`
    : capped.text;

/** Text files end in a newline so `cat` and diffs behave; empty stays empty. */
const withNewline = (text: string): string =>
  text.length === 0 || text.endsWith('\n') ? text : `${text}\n`;

export function buildRunDump(record: RunRecord, pipeline: PipelineSummary | null): BuiltDump {
  const { trace } = record;
  const last = trace?.iterations[trace.iterations.length - 1] ?? null;
  const startedAt = Date.parse(record.startedAt);
  const finishedAt = record.finishedAt ? Date.parse(record.finishedAt) : startedAt;

  const manifest = {
    schemaVersion: DUMP_SCHEMA_VERSION,
    runId: record.runId,
    kind: 'quality' as const,
    status: record.status,
    pipeline: trace ? `${trace.pipeline.id}@${trace.pipeline.version}` : record.pipeline,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: finishedAt - startedAt,
    llm: record.llm,
    git: record.git,
    finalDecision: trace?.finalDecision ?? null,
    stopReason: trace?.stopReason ?? null,
    overall: last?.decision.scores.overall ?? null,
    bestIteration: trace?.bestIteration ?? null,
    iterations: trace?.iterations.length ?? 0,
    criteria: trace?.contract.criteria.length ?? 0,
    exchangeCount: record.exchanges.length,
    error: record.error,
    note: 'Contains the goal and the model’s prose verbatim.',
  };

  const files: DumpFile[] = [
    { path: 'manifest.json', content: json(manifest) },
    { path: 'run.md', content: renderRunMarkdown(record, manifest) },
    { path: '01-goal.md', content: withNewline(record.request.goal) },
    { path: '02-contract.json', content: json(trace?.contract.criteria ?? null) },
    { path: '03-pipeline.json', content: json(pipeline) },
  ];

  for (const iteration of trace?.iterations ?? []) {
    const dir = `04-iterations/${pad(iteration.iteration)}`;
    const {
      artifact,
      rendered,
      validation,
      critics,
      evaluators,
      ledger,
      decision,
      remediations,
      ...rest
    } = iteration;
    files.push(
      { path: `${dir}/iteration.json`, content: json(rest) },
      { path: `${dir}/artifact.json`, content: json(artifact) },
      { path: `${dir}/artifact.md`, content: rendered === null ? '' : withNewline(rendered) },
      { path: `${dir}/validation.json`, content: json(validation) },
      { path: `${dir}/critics.json`, content: json(critics) },
      { path: `${dir}/evaluators.json`, content: json(evaluators) },
      { path: `${dir}/ledger.json`, content: json(ledger) },
      { path: `${dir}/decision.json`, content: json(decision) },
      { path: `${dir}/remediations.json`, content: json(remediations) },
    );
  }

  // Prompts as text, not JSON strings: `grep -r` over this tree is the point.
  record.exchanges.forEach((exchange, position) => {
    const stem = `05-llm/${pad(position + 1)}.${exchange.scope}.${exchange.ordinal}`;
    const system = capText(exchange.system);
    const user = capText(exchange.user);
    files.push(
      { path: `${stem}.system.txt`, content: withTruncationNote(system) },
      { path: `${stem}.user.txt`, content: withTruncationNote(user) },
      { path: `${stem}.response.json`, content: json(exchange.response) },
      {
        path: `${stem}.meta.json`,
        content: json({
          scope: exchange.scope,
          ordinal: exchange.ordinal,
          model: exchange.model,
          maxTokens: exchange.maxTokens,
          startedAt: exchange.startedAt,
          durationMs: exchange.durationMs,
          outcome: exchange.outcome,
          stopReason: exchange.stopReason,
          usage: exchange.usage,
          requestId: exchange.requestId,
          error: exchange.error,
          schema: exchange.schema,
          systemTruncated: system.truncated ? system.originalBytes : null,
          userTruncated: user.truncated ? user.originalBytes : null,
          text: capText(exchange.text ?? '').text,
        }),
      },
    );
  });

  files.push({ path: '06-lessons.json', content: json(trace?.lessons ?? []) });

  return {
    runId: record.runId,
    files,
    indexRow: `${JSON.stringify({
      runId: record.runId,
      kind: 'quality',
      at: record.finishedAt ?? record.startedAt,
      status: record.status,
      pipeline: manifest.pipeline,
      finalDecision: manifest.finalDecision,
      stopReason: manifest.stopReason,
      overall: manifest.overall,
      iterations: manifest.iterations,
      exchangeCount: manifest.exchangeCount,
      llmEnabled: record.llm.enabled,
    })}\n`,
  };
}

const iterationRow = (iteration: IterationTrace<unknown>): string => {
  const { ledger, decision } = iteration;
  const assessed = ledger.criteria.filter((evidence) => evidence.result !== 'unassessed').length;
  return `| ${iteration.iteration} | ${iteration.mode} | ${decision.finalDecision} | ${decision.scores.overall} | ${assessed}/${ledger.criteria.length} | ${ledger.findings.length} | ${decision.reason} |`;
};

/** The human entry point: what happened, in order, in one screen. */
export function renderRunMarkdown(
  record: RunRecord,
  manifest: {
    status: string;
    durationMs: number;
    finalDecision: string | null;
    stopReason: string | null;
  },
): string {
  const { trace } = record;
  const lines: string[] = [
    `# Quality-loop run ${record.runId}`,
    ``,
    `${record.finishedAt ?? record.startedAt} · ${manifest.status} · ${manifest.durationMs} ms · pipeline ${record.pipeline}`,
    ``,
  ];

  if (trace) {
    const last = trace.iterations[trace.iterations.length - 1];
    lines.push(
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
    );
    const diagnostics = trace.iterations.flatMap((iteration) => iteration.ledger.diagnostics);
    if (diagnostics.length > 0) {
      lines.push(
        `## Diagnostics`,
        ``,
        ...diagnostics.map(
          (diagnostic) =>
            `- \`${diagnostic.stage}\`${diagnostic.sample ? ` #${diagnostic.sample}` : ''} — ${diagnostic.reason}${diagnostic.detail ? `: ${diagnostic.detail}` : ''}`,
        ),
        ``,
      );
    }
    if (trace.lessons.length > 0) {
      lines.push(
        `## Lessons`,
        ``,
        ...trace.lessons.map(
          (lesson) =>
            `- ${lesson.kind} \`${lesson.subject}\` (${lesson.iterations.join('→')}): ${lesson.detail}`,
        ),
        ``,
      );
    }
  }

  if (record.error) {
    lines.push(`## Failed`, ``, '```', record.error.message, '```', ``);
  }

  lines.push(`## Model calls`, ``);
  if (record.exchanges.length === 0) {
    lines.push(
      record.llm.enabled
        ? `None — no stage reached the model.`
        : `None: the model is off (${record.llm.reason}). Every LLM stage returns before assembling a prompt.`,
      ``,
    );
  } else {
    lines.push(
      ...record.exchanges.map(
        (exchange) =>
          `- \`${exchange.scope}\` #${exchange.ordinal} — ${exchange.outcome}, ${exchange.durationMs} ms${exchange.usage ? `, ${exchange.usage.inputTokens} in / ${exchange.usage.outputTokens} out` : ''}`,
      ),
      ``,
    );
  }
  return lines.join('\n');
}
