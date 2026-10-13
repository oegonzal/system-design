/**
 * `main.js ingest <path…> [--kind resume|notes] [--subject <name>] [--chunk-bytes <n>] [--date <day>] [--limit <n>] [--dry-run] [--force] [--json]`
 * `main.js status [--refresh] [--json]`
 * `main.js export-studio --out <dir> [--json]`
 *
 * `parseOptions` reads argv; `execute` runs the options over the ports and
 * writes through `io`; `cli` wires the real adapters around them — no
 * framework, no database — and exits by the result: 2 for a usage problem or
 * an input the program cannot use, 1 when a chunk failed, was refused or was
 * settled with nothing stored, 0 otherwise.
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
import { refreshStatus } from './core/status';
import { renderExport, renderIngest, renderStatus } from './render';

export const USAGE = `usage: memory-ingest <command> [options]
  ingest  <path…> [--kind ${INGEST_KINDS.join('|')}] [--subject <name>] [--chunk-bytes <n>] [--parts-per-chunk <n>] [--date <day>] [--limit <n>] [--dry-run] [--force] [--json]
          reads each document (${Object.keys(READERS).join(', ')}), chunks it and posts one chunk at a time to the loop;
          --chunk-bytes defaults to ${DEFAULT_CHUNK_BYTES}; --date is the day the documents speak for;
          --limit posts at most n chunks then halts, the rest pending; --dry-run prints the chunks and posts nothing;
          a chunk whose facts the manifest holds as stored is skipped unless --force
  status  [--refresh] [--json]
          the manifest; --refresh re-reads every recorded orchestration from the loop
  export-studio --out <dir> [--json]
          writes the studio's experience profiles and STAR stories as markdown documents under <dir>,
          one titled section per record, for ingest to read like any notes file
exit: 0 ok · 1 a chunk failed, was refused or stored nothing · 2 usage, or an input the program cannot use
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
    if (command === 'ingest') {
      if (positionals.length === 0) return new Error('ingest takes at least one document path');
      return {
        command,
        paths: positionals,
        kind: ingestKind(values['kind'] as string | undefined),
        subject: subjectName(values['subject'] as string | undefined, '--subject'),
        chunkBytes: chunkBytes(values['chunk-bytes'] as string | undefined),
        partsPerChunk: partsPerChunk(values['parts-per-chunk'] as string | undefined),
        date: documentDate(values['date'] as string | undefined),
        limit: postLimit(values['limit'] as string | undefined),
        dryRun: (values['dry-run'] as boolean | undefined) ?? false,
        force: (values['force'] as boolean | undefined) ?? false,
        json: (values['json'] as boolean | undefined) ?? false,
      };
    }
    if (command === 'export-studio') {
      const out = values['out'] as string | undefined;
      if (out === undefined || out.trim() === '') return new Error('--out is required');
      return { command, out, json: (values['json'] as boolean | undefined) ?? false };
    }
    return {
      command,
      refresh: (values['refresh'] as boolean | undefined) ?? false,
      json: (values['json'] as boolean | undefined) ?? false,
    };
  } catch (error) {
    return error instanceof Error ? error : new Error(messageOf(error));
  }
}

const print = (io: Io, json: boolean, raw: unknown, text: string): void =>
  io.out(json ? JSON.stringify(raw, null, 2) : text);

/** The options over the ports; the exit code. */
export async function execute(options: Options, deps: CliDeps, io: Io): Promise<number> {
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
  // Anything short of facts in the store is not ok: a failure, a refusal, or a loop that settled with nothing stored.
  return report.failed > 0 || report.unstored > 0 || report.stopped !== null ? 1 : 0;
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
  const client = new HttpLoopClient(config.loopUrl);
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
