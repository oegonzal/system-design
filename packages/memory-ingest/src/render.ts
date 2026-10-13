import type { ChunkReport, FileReport, IngestReport } from './core/ingest';
import type { ManifestEntry, ManifestStep } from './core/ports';
import { whyNotStored } from './core/record';
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

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

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

function renderFile(file: FileReport): string {
  const head = `${file.document} · ${count(file.parts, 'part')} · ${count(file.chunks.length, 'chunk')}`;
  if (file.chunks.length === 0) return `${head}\n(no text was read — nothing to ingest)`;
  return [
    head,
    table(
      ['chunk', 'hash', 'bytes', 'parts', 'outcome', 'orchestration', 'under / error'],
      file.chunks.map(chunkRow),
    ),
  ].join('\n');
}

export function renderIngest(report: IngestReport): string {
  const summary = [
    `chunks ${report.chunks}`,
    `posted ${report.posted}`,
    `unstored ${report.unstored}`,
    `skipped ${report.skipped}`,
    `failed ${report.failed}`,
    ...(report.retracted > 0 ? [`retracted ${report.retracted}`] : []),
  ].join(' · ');
  const tail = [
    report.dryRun ? 'dry run — nothing was posted and nothing was recorded' : null,
    report.stopped
      ? `stopped at ${report.stopped.document} chunk ${report.stopped.chunk}: ${report.stopped.message}`
      : null,
    report.halted
      ? `halted after ${report.halted.after} chunk(s): ${report.halted.reason} — the pending chunks post on re-running the same command`
      : null,
  ].filter((line): line is string => line !== null);
  return [...report.files.map(renderFile), [summary, ...tail].join('\n')].join('\n\n');
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

const entryRow = (entry: ManifestEntry): string[] => [
  entry.document,
  `${entry.chunk.index}/${entry.chunk.of}`,
  entry.kind,
  entry.status,
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
