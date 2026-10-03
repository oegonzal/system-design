/** `run.md`: the human entry point of a dump — what happened, in order, in one screen. */
import {
  linkLabel,
  markdownCell,
  RECALL_EXCLUSION_REASONS,
  type IterationTrace,
  type Overrun,
  type RecallNoveltyDto,
  type RecallScreenedDto,
  type RunTrace,
} from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';

import type { RunRecord } from '../core/contracts';
import { outputsOf } from '../core/outputs';
import { anySalvage, callOverruns, type OverrunTally } from './overruns';

/** The manifest fields the page repeats. */
export interface RunHeadline {
  status: string;
  durationMs: number;
  finalDecision: string | null;
  stopReason: string | null;
  overruns: OverrunTally;
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

/**
 * The verdict with the best iteration's score — the one the run stands on —
 * and the last iteration's beside it when that is another: a last attempt
 * that fell short, or produced nothing, never reads as the run's score.
 */
function verdictLine(trace: RunTrace, status: string): string {
  const last = trace.iterations[trace.iterations.length - 1];
  const best = outputsOf(trace).best ?? last;
  const stopped = stoppedLine(trace, status);
  const lastClause =
    last === best ? '' : ` · last iteration ${last.iteration} ${last.decision.scores.overall}/100`;
  return `**${trace.finalDecision}** (${stopped}) · overall ${best.decision.scores.overall}/100 · best iteration ${best.iteration}${lastClause}`;
}

/** The verdict, every iteration as a row, and the last iteration's dimensions. */
function traceSection(trace: RunTrace, status: string): string[] {
  const last = trace.iterations[trace.iterations.length - 1];
  return [
    verdictLine(trace, status),
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

/** A lesson the screen matched, by where it is stored, and what it matched. */
const screenedLine = (action: string, item: RecallScreenedDto): string =>
  `- ${action} \`${item.sourceRunId}\` ${item.ref} (iteration ${item.iteration}) — ${item.reason}: ${item.matched.join(', ')}`;

/**
 * What a screen did with the search, in one line — the pool, what it set
 * aside as already known by reason, the twins it collapsed, what it offered,
 * and the chain it screened against — then each lesson it set aside or ranked
 * last. Nothing for a recall that screened nothing.
 */
function noveltyLines(novelty: RecallNoveltyDto | null): string[] {
  if (novelty === null) return [];
  const byReason = RECALL_EXCLUSION_REASONS.flatMap((reason) => {
    const count = novelty.excluded.filter((item) => item.reason === reason).length;
    return count === 0 ? [] : [`${reason} ${count}`];
  });
  const reasons = byReason.length === 0 ? '' : ` (${byReason.join(' · ')})`;
  const demoted = novelty.demoted.length === 0 ? '' : ` · demoted ${novelty.demoted.length}`;
  const screened = [
    ...novelty.excluded.map((item) => screenedLine('excluded', item)),
    ...novelty.demoted.map((item) => screenedLine('demoted', item)),
  ];
  return [
    `novelty: pool ${novelty.pool} → excluded ${novelty.excluded.length} as already known${reasons}${demoted} · collapsed ${novelty.collapsed} · offered ${novelty.offered} · chain ${novelty.chain.map(linkLabel).join(' → ')}`,
    ``,
    ...(screened.length === 0 ? [] : [...screened, ``]),
  ];
}

/**
 * What the run recalled for its producer, and the lessons the producer saw —
 * the curator's words, each with the run it came from and, when the recall
 * screened what the producer held, where it was learned. Nothing when the run
 * did not ask to recall.
 */
function recallSection(record: RunRecord): string[] {
  const { recall } = record;
  if (recall === null) return [];
  const why =
    recall.reason === null ? '' : ` (${recall.reason}${recall.note ? `: ${recall.note}` : ''})`;
  const from = recall.recallRunId === null ? '' : ` · recall run ${recall.recallRunId}`;
  const originOf = new Map(
    (recall.novelty?.origins ?? []).map((origin) => [origin.ref, origin.origin]),
  );
  return [
    `## Recall`,
    ``,
    `${recall.status}${why} · ${recall.count} lesson(s) handed to the producer${from}`,
    ``,
    ...noveltyLines(recall.novelty),
    ...recall.lessons.map((lesson) => {
      const origin = originOf.get(lesson.ref);
      return `- [${lesson.ref}] ${lesson.insight} — serves: ${lesson.serves}${lesson.caveat ? `; caveat: ${lesson.caveat}` : ''} (from run ${lesson.sourceRunId}${origin === undefined ? '' : ` · origin ${origin}`})`;
    }),
    ...(recall.lessons.length > 0 ? [``] : []),
  ];
}

const count = (value: number): string => value.toLocaleString('en-US');

/** `N characters` or `N items`: what a field's size is counted in. */
const sized = (overrun: Overrun): string =>
  `${count(overrun.actual)} ${overrun.kind === 'list' ? 'items' : 'characters'}`;

/** How the seam handled a field, with the items a trimmed list lost. */
const handling = (overrun: Overrun): string =>
  overrun.dropped === undefined
    ? overrun.handling
    : `${overrun.handling}, ${overrun.dropped} dropped`;

/**
 * Every field a call wrote past its target, and how the seam kept it — the
 * headline the manifest counts, then one row per field. Nothing when no call
 * overran, was read from a cut transcript, or was asked again with its faults.
 */
function overrunsSection(record: RunRecord, tally: OverrunTally): string[] {
  if (!anySalvage(tally)) return [];
  const rows = callOverruns(record.exchanges);
  return [
    `## Overruns`,
    ``,
    `${tally.overruns} overrun(s) in ${tally.calls} call(s) — ${tally.overCeiling} over the ceiling, ${tally.cut} cut, ${tally.trimmed} list(s) trimmed, ${tally.salvaged} salvaged from a cut transcript, ${tally.feedback} feedback ask(s)`,
    ``,
    ...(rows.length === 0
      ? []
      : [
          `| call | field | asked | accepted | written | handling |`,
          `| --- | --- | --- | --- | --- | --- |`,
          ...rows.map(({ scope, ordinal, overrun }) =>
            row([
              `${scope} #${ordinal}`,
              overrun.path,
              count(overrun.target),
              count(overrun.ceiling),
              sized(overrun),
              handling(overrun),
            ]),
          ),
          ``,
        ]),
  ];
}

/** What a call's record adds to its line: a turn that resumed, a value read from a cut turn, an ask that named the last one's faults. */
const salvageNotes = ({ apiCalls, salvage }: LlmExchange): string =>
  [
    apiCalls !== null && apiCalls !== undefined && apiCalls > 1 ? `, ${apiCalls} API calls` : '',
    salvage?.from === 'transcript' ? ' (salvaged from transcript)' : '',
    salvage?.feedback ? ' (asked with the previous reply’s faults)' : '',
  ].join('');

/** One line per exchange — with the recorded reason when it failed — or the reason there were none. */
function modelCallsSection(record: RunRecord): string[] {
  if (record.exchanges.length === 0) return [`None — no stage reached the model.`, ``];
  return [
    ...record.exchanges.map(
      (exchange) =>
        `- \`${exchange.scope}\` #${exchange.ordinal} — ${exchange.outcome}, ${exchange.durationMs} ms${exchange.usage ? `, ${exchange.usage.inputTokens} in / ${exchange.usage.outputTokens} out` : ''}${salvageNotes(exchange)}${exchange.error ? ` — ${exchange.error.name}: ${exchange.error.message.replace(/\s+/g, ' ').trim()}` : ''}`,
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
  lines.push(
    ...overrunsSection(record, headline.overruns),
    `## Model calls`,
    ``,
    ...modelCallsSection(record),
  );
  return lines.join('\n');
}
