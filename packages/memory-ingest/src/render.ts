import { EXPERIENCE_ORIGINS } from '@sysdesign/contracts';

import type { ExportReport } from './core/export-studio';
import type { ChunkReport, FileReport, IngestReport } from './core/ingest-report';
import type { ManifestEntry, ManifestStep } from './core/ports';
import { whyNotStored } from './core/record';
import type { DocumentRetraction, RetractReport, Retraction } from './core/retract';
import type { StatusRefresh } from './core/status';

/**
 * stdout for humans. Fixed-width tables built with padEnd — no dependency —
 * and `--json` prints the report objects untouched for anything else.
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

const SHORT_HASH = 12;
const NONE = '—';

const count = (n: number, noun: string, plural = `${noun}s`): string =>
  `${n} ${n === 1 ? noun : plural}`;

const chunkRow = (chunk: ChunkReport): string[] => [
  `${chunk.index}/${chunk.of}`,
  chunk.chunkHash.slice(0, SHORT_HASH),
  String(chunk.bytes),
  String(chunk.parts),
  chunk.outcome,
  chunk.orchestrationRunId ?? NONE,
  // Why nothing was stored when that is the case; otherwise where in the document the chunk sits.
  whyNotStored(chunk) ?? chunk.context ?? NONE,
];

/** Digest runs retracted and the points they removed, across batches; a batch that did not run counts nothing. */
function retractedTotal(retractions: readonly (Retraction | null)[]): string {
  const runs = retractions.flatMap((retraction) => retraction?.retracted ?? []);
  const points = runs.reduce((sum, run) => sum + run.removed, 0);
  return `${count(runs.length, 'digest run')} (${count(points, 'point')})`;
}

/**
 * A batch of retractions: the runs that removed points, with how many; the
 * runs that removed none, apart — what they stored was gone already, or they
 * stored nothing; the runs whose postings were recorded under another loop,
 * apart again, with what each removed — the loop asked counts only what its
 * own store held; and the runs left standing, with why.
 */
function retractionLines(retraction: Retraction): string[] {
  const here = retraction.retracted.filter((run) => run.recordedUnder === null);
  const removed = here.filter((run) => run.removed > 0);
  const empty = here.filter((run) => run.removed === 0);
  const elsewhere = [
    ...new Set(retraction.retracted.flatMap((run) => run.recordedUnder ?? [])),
  ].map((loopUrl) => {
    const under = retraction.retracted.filter((run) => run.recordedUnder === loopUrl);
    const each = under.map((run) => `${run.digestRunId} (${count(run.removed, 'point')})`);
    return `recorded under ${loopUrl}, retracted through ${retraction.through} (${under.length}): ${each.join(', ')}`;
  });
  const runs = (ids: readonly string[]): string => `(${ids.length}): ${ids.join(', ')}`;
  return [
    ...(removed.length === 0
      ? []
      : [
          table(
            ['digest run', 'points'],
            removed.map((run) => [run.digestRunId, String(run.removed)]),
          ),
        ]),
    ...(empty.length === 0 ? [] : [`held nothing ${runs(empty.map((run) => run.digestRunId))}`]),
    ...elsewhere,
    ...(retraction.left === null
      ? []
      : [`left standing ${runs(retraction.left.digestRunIds)} — ${retraction.left.error}`]),
  ];
}

/** The entries a retraction cannot reach — no digest run is known for them — and how to reach them, by the command to run again. */
const unresolvedLines = (unresolved: number, command: string): string[] =>
  unresolved === 0
    ? []
    : [
        `unresolved: ${count(unresolved, 'entry', 'entries')} with an orchestration whose report was never read — status --refresh reads it back from the loop; then ${command} again`,
      ];

/** Why a document's replacement was held back, when earlier digest runs outside its current plan still stand. */
const heldBackLines = (heldBack: FileReport['heldBack']): string[] =>
  heldBack === null || heldBack.earlierRuns === 0
    ? []
    : [
        `replacement held back at chunk ${heldBack.chunk} (${heldBack.outcome}): ${count(heldBack.earlierRuns, 'earlier digest run')} outside the current plan still ${heldBack.earlierRuns === 1 ? 'stands' : 'stand'}`,
      ];

const touched = (retraction: Retraction | null): retraction is Retraction =>
  retraction !== null && (retraction.retracted.length > 0 || retraction.left !== null);

function renderFile(file: FileReport): string {
  const head = `${file.document} · ${count(file.parts, 'part')} · ${count(file.chunks.length, 'chunk')}`;
  if (file.chunks.length === 0) return `${head}\n(no text was read — nothing to ingest)`;
  return [
    head,
    table(
      ['chunk', 'hash', 'bytes', 'parts', 'outcome', 'orchestration', 'under / error'],
      file.chunks.map(chunkRow),
    ),
    ...(touched(file.replaced)
      ? [`replaced ${retractedTotal([file.replaced])}`, ...retractionLines(file.replaced)]
      : []),
    ...heldBackLines(file.heldBack),
    ...unresolvedLines(file.unresolved, 'ingest'),
  ].join('\n');
}

export function renderIngest(report: IngestReport): string {
  const replaced = report.files.map((file) => file.replaced);
  const summary = [
    `chunks ${report.chunks}`,
    `posted ${report.posted}`,
    ...(report.noFacts > 0 ? [`no facts ${report.noFacts}`] : []),
    `unstored ${report.unstored}`,
    `skipped ${report.skipped}`,
    `failed ${report.failed}`,
    ...(replaced.some(touched) ? [`retracted ${retractedTotal(replaced)}`] : []),
  ].join(' · ');
  // A plain re-run skips every covered chunk: after a forced run, that includes the chunks it never reached.
  const resume = report.force
    ? 're-running without --force posts what is not covered yet, so the chunks this run did not reach keep their earlier digests; re-running with --force posts each document whole again'
    : 're-running the same command posts what is not covered yet';
  const tail = [
    report.dryRun ? 'dry run — nothing was posted and nothing was recorded' : null,
    report.stopped
      ? `stopped at ${report.stopped.document} chunk ${report.stopped.chunk}: ${report.stopped.message}`
      : null,
    report.halted
      ? `halted after ${report.halted.after} chunk(s): ${report.halted.reason} — ${resume}`
      : null,
  ].filter((line): line is string => line !== null);
  return [...report.files.map(renderFile), [summary, ...tail].join('\n')].join('\n\n');
}

/** One document retired: what its runs removed, what was retracted already, and what the record cannot say. */
function renderRetiring(document: DocumentRetraction): string {
  const ids = (label: string, runs: readonly string[]): string[] =>
    runs.length === 0 ? [] : [`${label} (${runs.length}): ${runs.join(', ')}`];
  return [
    `${document.document} · ${count(document.entries, 'entry', 'entries')}`,
    ...(document.retraction === null
      ? ids('would retract', document.runs)
      : retractionLines(document.retraction)),
    ...ids('already retracted', document.already),
    ...unresolvedLines(document.unresolved, 'retract'),
  ].join('\n');
}

export function renderRetract(report: RetractReport): string {
  const foot = report.dryRun
    ? 'dry run — nothing was retracted and nothing was recorded'
    : `retracted ${retractedTotal(report.documents.map((document) => document.retraction))}`;
  return [...report.documents.map(renderRetiring), foot].join('\n\n');
}

const stepCell = (step: ManifestStep | null): string => {
  if (step === null) return NONE;
  const counts = Object.entries(step.counts)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ');
  const reason = step.reason === null ? '' : `: ${step.reason}`;
  const note = step.note === null ? '' : ` — ${step.note}`;
  return `${step.status}${reason}${note}${counts === '' ? '' : ` (${counts})`}`;
};

/** When what the posting stored was retracted, and how many points went; empty while it stands. */
const retractedCell = (entry: ManifestEntry): string =>
  entry.retractedAt === null
    ? ''
    : `${entry.retractedAt} (${count(entry.retractedPoints ?? 0, 'point')})`;

const entryRow = (entry: ManifestEntry): string[] => [
  entry.document,
  `${entry.chunk.index}/${entry.chunk.of}`,
  entry.kind,
  entry.status,
  retractedCell(entry),
  stepCell(entry.steps.digest),
  stepCell(entry.steps.store),
  entry.ingestedAt,
  entry.orchestrationRunId ?? NONE,
  entry.error ?? '',
];

export function renderStatus(
  entries: readonly ManifestEntry[],
  refresh: StatusRefresh | null = null,
): string {
  const body =
    entries.length === 0
      ? '(the manifest is empty — nothing has been ingested)'
      : table(
          [
            'document',
            'chunk',
            'kind',
            'status',
            'retracted',
            'digest',
            'store',
            'ingested',
            'orchestration',
            'error',
          ],
          entries.map(entryRow),
        );
  const foot =
    refresh === null
      ? null
      : `refreshed ${refresh.refreshed} · still running ${refresh.running} · no longer at the loop ${refresh.missing}`;
  return [body, foot].filter((line): line is string => line !== null).join('\n');
}

/**
 * One line per source: the document written and how many of the subject's
 * records it holds, or that there was nothing to write — then how many records
 * were withheld under each origin, named by the origin, and whether a document
 * an earlier export left there was removed.
 */
export function renderExport(report: ExportReport): string {
  return report.files
    .map((file) => {
      const parts = [
        file.records === 0 ? 'no records — nothing written' : count(file.records, 'record'),
        ...EXPERIENCE_ORIGINS.flatMap((origin) => {
          const withheld = file.withheld[origin];
          return withheld === undefined ? [] : [`${withheld} withheld as ${origin}`];
        }),
        ...(file.removed ? ['the earlier document removed'] : []),
      ];
      return `${file.path}: ${parts.join(' · ')}`;
    })
    .join('\n');
}
