/**
 * `main.js ingest <path…> [--kind resume|notes] [--subject <name>] [--chunk-bytes <n>] [--date <day>] [--limit <n>] [--dry-run] [--force] [--json]`
 * `main.js retract <path…> [--dry-run] [--json]`
 * `main.js status [--refresh] [--json]`
 * `main.js export-studio --out <dir> [--json]`
 *
 * `parseOptions` reads argv; `execute` runs the options over the ports and
 * writes through `io`; `cli` wires the real adapters around them — no
 * framework, no database — and exits by the result: 2 for a usage problem, an
 * input the program cannot use, a path the manifest has no entry for, or a
 * manifest home another command is writing; 1 when a chunk failed, was
 * refused or was settled with nothing stored, or a retraction left a digest
 * run standing; 0 otherwise.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { HttpLoopClient } from '@sysdesign/loop-client';

import { JsonFileLedger } from './adapters/fs-ledger/json-file-ledger';
import { fsDocumentWriter } from './adapters/fs-writer/fs-document-writer';
import { LoopIngestSink } from './adapters/loop-http/loop-ingest-sink';
import { READERS, tableReader } from './adapters/readers/reader-table';
import { HttpStudioSource } from './adapters/studio-http/http-studio-source';
import {
  chunkBytes,
  documentDate,
  partsPerChunk,
  postLimit,
  DEFAULT_CHUNK_BYTES,
  DEFAULT_HOME,
  DEFAULT_LOOP_URL,
  DEFAULT_STUDIO_URL,
  INGEST_ENV,
  INGEST_FLAGS,
  INGEST_KINDS,
  INGEST_LOOP_RECOVERY,
  ingestKind,
  loadIngestConfig,
  subjectName,
  type IngestConfig,
  type IngestFlag,
  type IngestKind,
} from './config';
import { exportStudio } from './core/export-studio';
import { planIngest, runIngest, type IngestDeps } from './core/ingest';
import type { DocumentWriter, StudioSource } from './core/ports';
import { leftStanding, NotInManifest, retractDocuments } from './core/retract';
import { refreshStatus } from './core/status';
import { renderExport, renderIngest, renderRetract, renderStatus } from './render';

export const USAGE = `usage: memory-ingest <command> [options]
  ingest  <path…> [--kind ${INGEST_KINDS.join('|')}] [--subject <name>] [--chunk-bytes <n>] [--parts-per-chunk <n>] [--date <day>] [--limit <n>] [--dry-run] [--force] [--json]
          reads each document (${Object.keys(READERS).join(', ')}), chunks it and posts one chunk at a time to the loop;
          --chunk-bytes defaults to ${DEFAULT_CHUNK_BYTES}; --date is the day the documents speak for;
          --limit posts at most n chunks then halts, the rest pending; --dry-run prints the chunks and posts nothing;
          a chunk whose facts the manifest holds as stored is skipped unless --force; once every chunk of a
          document is stored, every other digest the manifest holds as stored for it is retracted
  retract <path…> [--dry-run] [--json]
          retracts every digest run the manifest's entries for each document name, whatever their status,
          and marks the entries; the documents are never read; --dry-run lists the runs and retracts nothing
  status  [--refresh] [--json]
          the manifest; --refresh re-reads every recorded orchestration from the loop
  export-studio --out <dir> [--json]
          writes the studio's experience profiles and STAR stories as markdown documents under <dir>,
          one titled section per record, for ingest to read like any notes file
exit: 0 ok · 1 a chunk failed, was refused or stored nothing, or a retraction left a digest run standing · 2 usage, an input the program cannot use, a path the manifest has no entry for, or a manifest home another command is writing
environment: ${INGEST_ENV.loopUrl} (default ${DEFAULT_LOOP_URL}), ${INGEST_ENV.studioUrl} (default ${DEFAULT_STUDIO_URL}), ${INGEST_ENV.home} (default ${DEFAULT_HOME}), ${INGEST_ENV.subject}`;

/** Commands, the flags each takes and whether it takes paths — as data. */
export const COMMANDS = {
  ingest: {
    flags: [
      'kind',
      'subject',
      'chunk-bytes',
      'parts-per-chunk',
      'date',
      'limit',
      'dry-run',
      'force',
      'json',
    ],
    paths: true,
  },
  retract: { flags: ['dry-run', 'json'], paths: true },
  status: { flags: ['refresh', 'json'], paths: false },
  'export-studio': { flags: ['out', 'json'], paths: false },
} as const satisfies Record<string, { flags: readonly IngestFlag[]; paths: boolean }>;
export type Command = keyof typeof COMMANDS;

export type Options =
  | {
      command: 'ingest';
      paths: string[];
      kind: IngestKind;
      /** Unset falls back to the environment; neither is a usage error at execute time. */
      subject: string | undefined;
      chunkBytes: number;
      partsPerChunk: number;
      date: string | null;
      limit: number | null;
      dryRun: boolean;
      force: boolean;
      json: boolean;
    }
  | { command: 'retract'; paths: string[]; dryRun: boolean; json: boolean }
  | { command: 'status'; refresh: boolean; json: boolean }
  | { command: 'export-studio'; out: string; json: boolean };

/** What `execute` writes to and how it is answered. */
export interface Io {
  out(text: string): void;
  error(text: string): void;
}

export interface CliDeps extends IngestDeps {
  config: IngestConfig;
  cwd: string;
  studio: StudioSource;
  writer: DocumentWriter;
}

const isCommand = (value: string | undefined): value is Command =>
  value !== undefined && Object.hasOwn(COMMANDS, value);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** argv → options, or an Error whose message is the usage problem. */
export function parseOptions(argv: readonly string[]): Options | Error {
  const [command, ...rest] = argv;
  if (!isCommand(command)) return new Error(USAGE);
  const spec = COMMANDS[command];
  try {
    const { values, positionals } = parseArgs({
      args: [...rest],
      allowPositionals: spec.paths,
      options: Object.fromEntries(
        spec.flags.map((flag) => [flag, { type: INGEST_FLAGS[flag].type }]),
      ),
    });
    if (spec.paths && positionals.length === 0) {
      return new Error(`${command} takes at least one document path`);
    }
    const flag = (name: IngestFlag): boolean => (values[name] as boolean | undefined) ?? false;
    if (command === 'ingest') {
      return {
        command,
        paths: positionals,
        kind: ingestKind(values['kind'] as string | undefined),
        subject: subjectName(values['subject'] as string | undefined, '--subject'),
        chunkBytes: chunkBytes(values['chunk-bytes'] as string | undefined),
        partsPerChunk: partsPerChunk(values['parts-per-chunk'] as string | undefined),
        date: documentDate(values['date'] as string | undefined),
        limit: postLimit(values['limit'] as string | undefined),
        dryRun: flag('dry-run'),
        force: flag('force'),
        json: flag('json'),
      };
    }
    if (command === 'retract') {
      return { command, paths: positionals, dryRun: flag('dry-run'), json: flag('json') };
    }
    if (command === 'export-studio') {
      const out = values['out'] as string | undefined;
      if (out === undefined || out.trim() === '') return new Error('--out is required');
      return { command, out, json: flag('json') };
    }
    return { command, refresh: flag('refresh'), json: flag('json') };
  } catch (error) {
    return error instanceof Error ? error : new Error(messageOf(error));
  }
}

const print = (io: Io, json: boolean, raw: unknown, text: string): void =>
  io.out(json ? JSON.stringify(raw, null, 2) : text);

/** Whether the command saves the manifest: what it does then runs holding the home's lock. */
const savesManifest = (options: Options): boolean => {
  if (options.command === 'ingest' || options.command === 'retract') return !options.dryRun;
  return options.command === 'status' && options.refresh;
};

/** The options over the ports; the exit code. A command that saves the manifest runs as its one writer. */
export async function execute(options: Options, deps: CliDeps, io: Io): Promise<number> {
  if (!savesManifest(options)) return dispatch(options, deps, io);
  let release: () => Promise<void>;
  try {
    release = await deps.ledger.lock();
  } catch (error) {
    // Another command is writing the home: anything saved now would overwrite what it records.
    io.error(messageOf(error));
    return 2;
  }
  try {
    return await dispatch(options, deps, io);
  } finally {
    await release();
  }
}

async function dispatch(options: Options, deps: CliDeps, io: Io): Promise<number> {
  if (options.command === 'export-studio') {
    try {
      const report = await exportStudio(deps, resolve(deps.cwd, options.out));
      print(io, options.json, report, renderExport(report));
      return 0;
    } catch (error) {
      // The studio could not be read — unreachable, or it refused a list: nothing was written.
      io.error(messageOf(error));
      return 2;
    }
  }
  if (options.command === 'status') {
    const refresh = options.refresh ? await refreshStatus(deps) : null;
    const entries = refresh?.entries ?? (await deps.ledger.load());
    print(io, options.json, { entries, refresh }, renderStatus(entries, refresh));
    return 0;
  }
  if (options.command === 'retract') {
    let report;
    try {
      report = await retractDocuments(
        options.paths,
        { dryRun: options.dryRun, cwd: deps.cwd },
        deps,
      );
    } catch (error) {
      if (!(error instanceof NotInManifest)) throw error;
      // Nothing was retracted: a path given from another directory, or under another home, reads as no document.
      io.error(error.message);
      return 2;
    }
    print(io, options.json, report, renderRetract(report));
    return report.documents.some((document) => leftStanding(document.retraction) > 0) ? 1 : 0;
  }

  const subject = options.subject ?? deps.config.subject;
  if (subject === undefined) {
    io.error(
      `a subject is required: --subject <name>, or ${INGEST_ENV.subject} in the environment`,
    );
    return 2;
  }
  const planning = { ...options, subject, cwd: deps.cwd };
  let documents;
  try {
    documents = await planIngest(options.paths, planning, deps);
  } catch (error) {
    // Nothing was posted: an unreadable file, an extension no reader takes, a part the budget cannot hold.
    io.error(messageOf(error));
    return 2;
  }
  const report = await runIngest(documents, options, deps);
  print(io, options.json, report, renderIngest(report));
  // Anything short of facts in the store is not ok: a failure, a refusal, a loop that settled with
  // nothing stored, or an earlier digest left standing beside its replacement.
  const standing = report.files.some((file) => leftStanding(file.replaced) > 0);
  return report.failed > 0 || report.unstored > 0 || report.stopped !== null || standing ? 1 : 0;
}

/** The real adapters around `execute`. The environment and working directory are handed in by `main.ts`, read nowhere here. */
export async function cli(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  /** Asked between chunks; true halts the run with everything it has recorded. */
  interrupted?: () => boolean,
): Promise<number> {
  const options = parseOptions(argv);
  if (options instanceof Error) {
    console.error(options.message);
    return 2;
  }
  let config: IngestConfig;
  try {
    config = loadIngestConfig(env);
  } catch (error) {
    console.error(messageOf(error));
    return 2;
  }
  const client = new HttpLoopClient(config.loopUrl, fetch, INGEST_LOOP_RECOVERY);
  const deps: CliDeps = {
    config,
    cwd,
    reader: tableReader(),
    sink: new LoopIngestSink(client),
    ledger: new JsonFileLedger(resolve(cwd, config.home)),
    clock: { now: () => new Date().toISOString() },
    interrupted,
    loopUrl: config.loopUrl,
    studio: new HttpStudioSource(config.studioUrl),
    writer: fsDocumentWriter,
  };
  return execute(options, deps, {
    out: (text) => console.log(text),
    error: (text) => console.error(text),
  });
}
