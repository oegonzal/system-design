import { resolve } from 'node:path';

import { errorMessage, type MemoryScope } from '@sysdesign/contracts';

import { print, type CliDeps, type Io } from './commands';
import { INGEST_ENV, IngestConfigError, type IngestKind } from './config';
import { exportStudio } from './core/export-studio';
import { planIngest, runIngest, type IngestDeps } from './core/ingest';
import type { IngestSink } from './core/ports';
import { leftStanding, NotInManifest, retractDocuments } from './core/retract';
import { refreshStatus } from './core/status';
import { partsPerChunkWithin } from './flag-values';
import { renderExport, renderIngest, renderRetract, renderStatus } from './render';

/**
 * The commands over the manifest — ingest, retract, status and the studio
 * export — each run over the ports and answered with an exit code: 2 for an
 * input the program cannot use, a path the manifest has no entry for, or a
 * store that cannot serve the run; 1 when a chunk failed, was refused or was
 * settled with its facts left out of the store, or a retraction left a digest
 * run standing; 0 otherwise.
 */
export type ManifestOptions =
  | {
      command: 'ingest';
      paths: string[];
      kind: IngestKind;
      /** Unset falls back to the environment; neither is a usage error at execute time. */
      subject: string | undefined;
      chunkBytes: number;
      partsPerChunk: number;
      date: string | null;
      /** The scope the documents declare for every memory in the loop's store; null when they declare none. */
      scope: MemoryScope | null;
      limit: number | null;
      dryRun: boolean;
      force: boolean;
      json: boolean;
    }
  | { command: 'retract'; paths: string[]; dryRun: boolean; json: boolean }
  | { command: 'status'; refresh: boolean; json: boolean }
  | { command: 'export-studio'; out: string; json: boolean };

/** Whether the command saves the manifest: what it does then runs holding the home's lock. */
export const savesManifest = (options: ManifestOptions): boolean => {
  if (options.command === 'ingest' || options.command === 'retract') return !options.dryRun;
  return options.command === 'status' && options.refresh;
};

/** The store, resolved for a command that reaches it; a store that cannot serve the run is said, exit 2. */
async function sinkFor(deps: CliDeps, io: Io): Promise<IngestSink | null> {
  try {
    return await deps.sink();
  } catch (error) {
    io.error(`${INGEST_ENV.sink.name}=${deps.config.sink.kind}: ${errorMessage(error)}`);
    return null;
  }
}

const ingestDeps = (deps: CliDeps, sink: IngestSink): IngestDeps => ({
  reader: deps.reader,
  sink,
  ledger: deps.ledger,
  clock: deps.clock,
  interrupted: deps.interrupted,
});

async function exportCommand(options: { out: string; json: boolean }, deps: CliDeps, io: Io) {
  try {
    const report = await exportStudio(deps, resolve(deps.cwd, options.out));
    print(io, options.json, report, renderExport(report));
    return 0;
  } catch (error) {
    // The studio could not be read — unreachable, or it refused a list — or it served a record whose
    // origin is not known: nothing was written. A document that could not be written or removed is
    // reported the same way, and a source exported before it may already be on disk.
    io.error(errorMessage(error));
    return 2;
  }
}

async function statusCommand(options: { refresh: boolean; json: boolean }, deps: CliDeps, io: Io) {
  const sink = options.refresh ? await sinkFor(deps, io) : null;
  if (options.refresh && sink === null) return 2;
  const refresh = sink === null ? null : await refreshStatus({ sink, ledger: deps.ledger });
  const entries = refresh?.entries ?? (await deps.ledger.load());
  print(io, options.json, { entries, refresh }, renderStatus(entries, refresh));
  return 0;
}

async function retractCommand(
  options: { paths: string[]; dryRun: boolean; json: boolean },
  deps: CliDeps,
  io: Io,
) {
  const sink = await sinkFor(deps, io);
  if (sink === null) return 2;
  let report;
  try {
    report = await retractDocuments(
      options.paths,
      { dryRun: options.dryRun, cwd: deps.cwd },
      { sink, ledger: deps.ledger, clock: deps.clock },
    );
  } catch (error) {
    if (!(error instanceof NotInManifest)) throw error;
    // Nothing was retracted: a path given from another directory, under another home, or posted through the other sink reads as no document.
    io.error(error.message);
    return 2;
  }
  print(io, options.json, report, renderRetract(report));
  return report.documents.some((document) => leftStanding(document.retraction) > 0) ? 1 : 0;
}

async function ingestCommand(
  options: Extract<ManifestOptions, { command: 'ingest' }>,
  deps: CliDeps,
  io: Io,
) {
  const subject = options.subject ?? deps.config.subject;
  if (subject === undefined) {
    io.error(
      `a subject is required: --subject <name>, or ${INGEST_ENV.subject.name} in the environment`,
    );
    return 2;
  }
  try {
    partsPerChunkWithin(options.partsPerChunk, deps.config.sink.kind);
  } catch (error) {
    if (!(error instanceof IngestConfigError)) throw error;
    io.error(error.message);
    return 2;
  }
  const sink = await sinkFor(deps, io);
  if (sink === null) return 2;
  const planning = { ...options, subject, cwd: deps.cwd };
  let documents;
  try {
    documents = await planIngest(options.paths, planning, deps);
  } catch (error) {
    // Nothing was posted: an unreadable file, an extension no reader takes, a part the budget cannot hold.
    io.error(errorMessage(error));
    return 2;
  }
  const report = await runIngest(documents, options, ingestDeps(deps, sink));
  print(io, options.json, report, renderIngest(report));
  // Anything short of every chunk covered is not ok: a failure, a refusal, a digest that settled with
  // the facts unstored, or an earlier digest left standing beside its replacement.
  const standing = report.files.some((file) => leftStanding(file.replaced) > 0);
  return report.failed > 0 || report.unstored > 0 || report.stopped !== null || standing ? 1 : 0;
}

/** One manifest command over the ports; the exit code. The lock is `execute`'s, in `cli.ts`. */
export function runManifestCommand(
  options: ManifestOptions,
  deps: CliDeps,
  io: Io,
): Promise<number> {
  if (options.command === 'export-studio') return exportCommand(options, deps, io);
  if (options.command === 'status') return statusCommand(options, deps, io);
  if (options.command === 'retract') return retractCommand(options, deps, io);
  return ingestCommand(options, deps, io);
}
