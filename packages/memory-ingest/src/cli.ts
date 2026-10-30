/**
 * `main.js ingest <path…> [--kind resume|notes] [--subject <name>] [--chunk-bytes <n>] [--parts-per-chunk <n>] [--date <day>] [--scope <scope>] [--limit <n>] [--dry-run] [--force] [--json]`
 * `main.js retract <path…> [--dry-run] [--json]`
 * `main.js status [--refresh] [--json]`
 * `main.js export-studio --out <dir> [--json]`
 * `main.js recall --space <name> --tenant <t> (--key <k> | --text <t>) [--under k=v,…] [--register <r>] [--json]`
 * `main.js history <recordId> --space <name> --tenant <t> [--under k=v,…] [--json]`
 * `main.js forget <recordId> --space <name> --tenant <t> --reason "<why>" [--under k=v,…] [--json]`
 *
 * `parseOptions` reads argv; `execute` runs the options over the ports and
 * writes through `io`; `cli` wires the real adapters around them — no
 * framework, no database — and exits by the result: 2 for a usage problem, an
 * input the program cannot use, a path the manifest has no entry for, a store
 * that cannot serve the run, or a manifest home another command is writing; 1
 * when a chunk failed, was refused or was settled with its facts left out of
 * the store, or a retraction left a digest run standing; 0 otherwise.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { HttpMemoryClient, type MemoryClient } from '@sysdesign/agentic-memory-client';
import { errorMessage } from '@sysdesign/contracts';
import { HttpLoopClient } from '@sysdesign/loop-client';

import { JsonFileLedger } from './adapters/fs-ledger/json-file-ledger';
import { fsDocumentWriter } from './adapters/fs-writer/fs-document-writer';
import { LoopIngestSink } from './adapters/loop-http/loop-ingest-sink';
import { READERS, tableReader } from './adapters/readers/reader-table';
import { resolveIngestSpace } from './adapters/space-http/ingest-space';
import { SpaceIngestSink } from './adapters/space-http/space-ingest-sink';
import { HttpStudioSource } from './adapters/studio-http/http-studio-source';
import type { CliDeps, Io } from './commands';
import {
  DIGEST_POLL_EVERY_MS,
  INGEST_ENV,
  INGEST_FLAGS,
  INGEST_KINDS,
  INGEST_RECOVERY,
  loadIngestConfig,
  registerName,
  spaceName,
  subjectName,
  tenantName,
  type IngestConfig,
  type IngestFlag,
} from './config';
import type { IngestSink } from './core/ports';
import {
  chunkBytes,
  documentDate,
  documentScope,
  forgetReason,
  ingestKind,
  partsPerChunk,
  postLimit,
  scopeUnder,
} from './flag-values';
import { runManifestCommand, savesManifest, type ManifestOptions } from './manifest-commands';
import { runSpaceCommand, type SpaceCommandOptions } from './space-commands';

/** One line per flag, with what it means as `INGEST_FLAGS` declares it. */
function flagLines(): string {
  const flags = Object.entries(INGEST_FLAGS).map(
    ([name, flag]) => [`--${name}`, flag.describe] as const,
  );
  const width = Math.max(...flags.map(([name]) => name.length));
  return flags.map(([name, meaning]) => `  ${name.padEnd(width)}  ${meaning}`).join('\n');
}

/** One line per variable, with its default where it has one. */
const envLine = (): string =>
  Object.values(INGEST_ENV)
    .map(({ name, fallback }) => (fallback === null ? name : `${name} (default ${fallback})`))
    .join(', ');

export const USAGE = `usage: memory-ingest <command> [options]
  ingest  <path…> [--kind ${INGEST_KINDS.join('|')}] [--subject <name>] [--chunk-bytes <n>] [--parts-per-chunk <n>] [--date <day>] [--limit <n>] [--dry-run] [--force] [--json]
          reads each document (${Object.keys(READERS).join(', ')}), chunks it and posts one chunk at a time to the configured store (${INGEST_ENV.sink.name});
          a chunk the document's own postings through that store cover — its facts stored, or none to store — is skipped unless --force;
          once every chunk of a document is covered, every other digest run its entries through that store name is retracted
  retract <path…> [--dry-run] [--json]
          retracts every digest run the manifest's entries through the configured store name for each document, whatever their status,
          and marks the entries; the documents are never read
  status  [--refresh] [--json]
          the manifest; --refresh re-reads every posting made through the configured store
  export-studio --out <dir> [--json]
          writes the subject's own experience profiles and STAR stories as markdown documents under <dir>,
          one titled section per record, for ingest to read like any notes file; a practice example, a story
          drawn from one and every practice line are withheld, and a source left with none of the subject's
          records removes the document an earlier export wrote
  recall  --space <name> --tenant <t> (--key <k> | --text <t>) [--under k=v,…] [--register <r>] [--json]
          what a memory space holds for one tenant, by a key or by meaning — narrowed by the keys an agent wrote under
  history <recordId> --space <name> --tenant <t> [--under k=v,…] [--json]
          every version of one record, oldest first
  forget  <recordId> --space <name> --tenant <t> --reason "<why>" [--under k=v,…] [--json]
          closes one record with the reason, kept on it
flags:
${flagLines()}
exit: 0 ok · 1 a chunk failed, was refused or was settled with its facts unstored, or a retraction left a digest run standing · 2 usage, an input the program cannot use, a path the manifest has no entry for, a store that cannot serve the run, or a manifest home another command is writing
environment: ${envLine()}`;

/** What a command takes after its name: nothing, document paths (at least one), or one record id. */
type Positionals = 'none' | 'documents' | 'record';

/** Commands, the flags each takes and what it takes after its name — as data. */
export const COMMANDS = {
  ingest: {
    flags: [
      'kind',
      'subject',
      'chunk-bytes',
      'parts-per-chunk',
      'date',
      'scope',
      'limit',
      'dry-run',
      'force',
      'json',
    ],
    positionals: 'documents',
  },
  retract: { flags: ['dry-run', 'json'], positionals: 'documents' },
  status: { flags: ['refresh', 'json'], positionals: 'none' },
  'export-studio': { flags: ['out', 'json'], positionals: 'none' },
  recall: {
    flags: ['space', 'tenant', 'under', 'key', 'text', 'register', 'json'],
    positionals: 'none',
  },
  history: { flags: ['space', 'tenant', 'under', 'json'], positionals: 'record' },
  forget: { flags: ['space', 'tenant', 'under', 'reason', 'json'], positionals: 'record' },
} as const satisfies Record<string, { flags: readonly IngestFlag[]; positionals: Positionals }>;
export type Command = keyof typeof COMMANDS;

/** The commands over a memory space, which reach no manifest and no store of the ingest's. */
const SPACE_COMMANDS = ['recall', 'history', 'forget'] as const satisfies readonly Command[];

export type Options = ManifestOptions | SpaceCommandOptions;

const isCommand = (value: string | undefined): value is Command =>
  value !== undefined && Object.hasOwn(COMMANDS, value);

const isSpaceCommand = (options: Options): options is SpaceCommandOptions =>
  (SPACE_COMMANDS as readonly string[]).includes(options.command);

/** A flag's value, required: the trimmed value, or a usage error naming the flag. */
const required = (values: Record<string, unknown>, flag: IngestFlag): string => {
  const value = values[flag] as string | undefined;
  if (value === undefined || value.trim() === '') throw new Error(`--${flag} is required`);
  return value;
};

/** argv → options, or an Error whose message is the usage problem. */
export function parseOptions(argv: readonly string[]): Options | Error {
  const [command, ...rest] = argv;
  if (!isCommand(command)) return new Error(USAGE);
  const spec = COMMANDS[command];
  try {
    const { values, positionals } = parseArgs({
      args: [...rest],
      allowPositionals: spec.positionals !== 'none',
      options: Object.fromEntries(
        spec.flags.map((flag) => [flag, { type: INGEST_FLAGS[flag].type }]),
      ),
    });
    if (spec.positionals === 'documents' && positionals.length === 0) {
      return new Error(`${command} takes at least one document path`);
    }
    if (spec.positionals === 'record' && positionals.length !== 1) {
      return new Error(`${command} takes one record id`);
    }
    const flag = (name: IngestFlag): boolean => (values[name] as boolean | undefined) ?? false;
    const text = (name: IngestFlag): string | undefined => values[name] as string | undefined;
    if (command === 'ingest') {
      return {
        command,
        paths: positionals,
        kind: ingestKind(text('kind')),
        subject: subjectName(text('subject'), '--subject'),
        chunkBytes: chunkBytes(text('chunk-bytes')),
        partsPerChunk: partsPerChunk(text('parts-per-chunk')),
        date: documentDate(text('date')),
        scope: documentScope(text('scope')),
        limit: postLimit(text('limit')),
        dryRun: flag('dry-run'),
        force: flag('force'),
        json: flag('json'),
      };
    }
    if (command === 'retract') {
      return { command, paths: positionals, dryRun: flag('dry-run'), json: flag('json') };
    }
    if (command === 'export-studio') {
      return { command, out: required(values, 'out'), json: flag('json') };
    }
    if (command === 'status') return { command, refresh: flag('refresh'), json: flag('json') };
    const space = spaceName(required(values, 'space'), '--space');
    const tenant = tenantName(required(values, 'tenant'), '--tenant');
    const under = scopeUnder(text('under'));
    if (command === 'recall') {
      const key = text('key') ?? null;
      const question = text('text') ?? null;
      if (key === null && question === null) return new Error('--key or --text is required');
      const register = text('register');
      return {
        command,
        space,
        tenant,
        under,
        key,
        text: question,
        register: register === undefined ? null : registerName(register, '--register'),
        json: flag('json'),
      };
    }
    const recordId = positionals[0] as string;
    if (command === 'history') {
      return { command, recordId, space, tenant, under, json: flag('json') };
    }
    return {
      command,
      recordId,
      space,
      tenant,
      under,
      reason: forgetReason(required(values, 'reason')),
      json: flag('json'),
    };
  } catch (error) {
    return error instanceof Error ? error : new Error(errorMessage(error));
  }
}

/** The options over the ports; the exit code. A command that saves the manifest runs as its one writer. */
export async function execute(options: Options, deps: CliDeps, io: Io): Promise<number> {
  if (isSpaceCommand(options)) {
    return runSpaceCommand(options, deps.memory, deps.config.memoryUrl, io);
  }
  if (!savesManifest(options)) return runManifestCommand(options, deps, io);
  let release: () => Promise<void>;
  try {
    release = await deps.ledger.lock();
  } catch (error) {
    // Another command is writing the home: anything saved now would overwrite what it records.
    io.error(errorMessage(error));
    return 2;
  }
  try {
    return await runManifestCommand(options, deps, io);
  } finally {
    await release();
  }
}

/**
 * The store the manifest commands post to and act on, by the configured
 * sink: the loop through its client, or a memory space checked against its
 * host — the space under its name compiles, declares a partition, and every
 * register the digests may file into exists and takes a remember.
 */
async function ingestSink(config: IngestConfig, memory: MemoryClient): Promise<IngestSink> {
  if (config.sink.kind === 'space') {
    const space = await resolveIngestSpace(memory, config.sink, config.memoryUrl);
    return new SpaceIngestSink(memory, space, { pollEveryMs: DIGEST_POLL_EVERY_MS });
  }
  const client = new HttpLoopClient(config.loopUrl, fetch, INGEST_RECOVERY);
  return new LoopIngestSink(client, config.loopUrl);
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
    console.error(errorMessage(error));
    return 2;
  }
  const memory = new HttpMemoryClient(config.memoryUrl, { recovery: INGEST_RECOVERY });
  const deps: CliDeps = {
    config,
    cwd,
    reader: tableReader(),
    sink: () => ingestSink(config, memory),
    ledger: new JsonFileLedger(resolve(cwd, config.home)),
    clock: { now: () => new Date().toISOString() },
    interrupted,
    studio: new HttpStudioSource(config.studioUrl),
    writer: fsDocumentWriter,
    memory,
  };
  return execute(options, deps, {
    out: (text) => console.log(text),
    error: (text) => console.error(text),
  });
}
