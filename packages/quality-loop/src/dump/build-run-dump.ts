/**
 * The run dump: everything one run saw, said and decided. Pure — the layout is
 * decided here and written by `@sysdesign/run-dump`, so it can be tested
 * without a filesystem. The layout IS the contract future analysis reads.
 *
 * NOTE FOR READERS: these files contain the goal and the model's prose verbatim.
 */
import { recallSummary, type IterationTrace, type PipelineSummary } from '@sysdesign/contracts';
import { DUMP_SCHEMA_VERSION, type BuiltDump, type DumpFile } from '@sysdesign/run-dump';

import type { RunRecord } from '../core/contracts';
import { outputsOf } from '../core/outputs';
import { exchangeFiles, json, pad, withNewline } from './dump-files';
import { tallyOverruns } from './overruns';
import { renderRunMarkdown } from './render-run-markdown';

/**
 * `manifest.json`: the run at a glance, every number the index row and
 * `run.md` repeat. Its `overall` is the best iteration's, as the run's own
 * record says it: the last one may have fallen short of it or produced
 * nothing at all.
 */
function manifestOf(record: RunRecord) {
  const { trace } = record;
  const best = trace === null ? null : outputsOf(trace).best;
  const startedAt = Date.parse(record.startedAt);
  const finishedAt = record.finishedAt ? Date.parse(record.finishedAt) : startedAt;
  return {
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
    overall: best?.decision.scores.overall ?? null,
    bestIteration: trace?.bestIteration ?? null,
    iterations: trace?.iterations.length ?? 0,
    criteria: trace?.contract.criteria.length ?? 0,
    criteriaProvided: record.request.criteriaProvided,
    acceptAt: record.request.acceptAt,
    adoptedFrom: record.request.adoptedFrom,
    parentRunId: record.parentRunId,
    recall: record.recall === null ? null : recallSummary(record.recall),
    exchangeCount: record.exchanges.length,
    // What the seam kept past a target, salvaged from a cut turn or asked again.
    overruns: tallyOverruns(record.exchanges),
    error: record.error,
    note: 'Contains the goal and the model’s prose verbatim.',
  };
}

type Manifest = ReturnType<typeof manifestOf>;

/** `04-iterations/NN/`: the iteration's own fields, then each lens's output as its own file. */
function iterationFiles(iteration: IterationTrace): DumpFile[] {
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
  return [
    { path: `${dir}/iteration.json`, content: json(rest) },
    { path: `${dir}/artifact.json`, content: json(artifact) },
    { path: `${dir}/artifact.md`, content: rendered === null ? '' : withNewline(rendered) },
    { path: `${dir}/validation.json`, content: json(validation) },
    { path: `${dir}/critics.json`, content: json(critics) },
    { path: `${dir}/evaluators.json`, content: json(evaluators) },
    { path: `${dir}/ledger.json`, content: json(ledger) },
    { path: `${dir}/decision.json`, content: json(decision) },
    { path: `${dir}/remediations.json`, content: json(remediations) },
  ];
}

/** One line of `index.jsonl`: the run as the index lists it. */
const indexRowOf = (record: RunRecord, manifest: Manifest): string =>
  `${JSON.stringify({
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
    overruns: manifest.overruns.overruns,
    model: record.llm.model,
  })}\n`;

export function buildRunDump(record: RunRecord, pipeline: PipelineSummary | null): BuiltDump {
  const { trace } = record;
  const manifest = manifestOf(record);
  const files: DumpFile[] = [
    { path: 'manifest.json', content: json(manifest) },
    { path: 'run.md', content: renderRunMarkdown(record, manifest) },
    { path: '01-goal.md', content: withNewline(record.request.goal) },
    { path: '02-contract.json', content: json(trace?.contract.criteria ?? null) },
    { path: '03-pipeline.json', content: json(pipeline) },
    // What the producer was handed before it produced, and where it came from.
    ...(record.recall === null ? [] : [{ path: 'recall.json', content: json(record.recall) }]),
    ...(trace?.iterations ?? []).flatMap(iterationFiles),
    ...record.exchanges.flatMap(exchangeFiles),
    { path: '06-lessons.json', content: json(trace?.lessons ?? []) },
  ];
  return { runId: record.runId, files, indexRow: indexRowOf(record, manifest) };
}
