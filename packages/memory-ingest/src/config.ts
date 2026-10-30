import {
  DOCUMENT_SUBJECT_MAX_LENGTH,
  isUnitBound,
  keptAtMost,
  MEMORY_SCOPES,
  REGISTER_DIGEST_MAX_PARTS,
  REGISTER_NAME_BOUND,
  spaceNameSchema,
  STRATEGY_REGISTERS_BOUND,
  type DocumentKind,
  type MemoryScope,
  type Recovery,
} from '@sysdesign/contracts';

import { MAX_PARTS_PER_CHUNK, PARTS_PER_CHUNK } from './core/chunk';
import { INGEST_SINKS, type IngestSinkKind } from './core/ports';

/**
 * The ingester's configuration, declared once.
 *
 * Every flag the command line takes and every environment variable the
 * program reads is named here as data; `cli.ts` builds its parser from the
 * flags, `flag-values.ts` reads each flag's value, and `loadIngestConfig` is
 * the one read of the environment. A value that cannot be used is refused by
 * name, never defaulted around.
 */

/** The document kinds a user ingests; `guidance` is the browser session's and never comes from a file. */
export const INGEST_KINDS = ['resume', 'notes'] as const satisfies readonly DocumentKind[];
export type IngestKind = (typeof INGEST_KINDS)[number];
export const DEFAULT_KIND: IngestKind = 'notes';

/**
 * The scopes a file may declare for every memory it states in the loop's
 * store: those not bound to a unit of work. A file names no unit of work, and
 * a memory bound to one is read only for the unit it was recorded for, so a
 * document declaring such a scope could teach nothing any search reads.
 */
export const INGEST_SCOPES: readonly MemoryScope[] = MEMORY_SCOPES.filter(
  (scope) => !isUnitBound(scope),
);

/** How large a rendered chunk goal may grow; well under the engine's budget so a digest reads one screen of facts. */
export const DEFAULT_CHUNK_BYTES = 6000;

/**
 * How long a call to the loop or to the memory host rides out a service that
 * is restarting before its failure stands: a call that never reached it, or
 * a read it answered with a server error, is asked again every 2 s for 60 s —
 * ten times the six seconds within which each of fifteen watch-mode restarts
 * of the loop, measured on 2026-10-10, listened again, so several restarts
 * back to back are ridden out too. A start still unreachable past the window
 * stops the run.
 */
export const INGEST_RECOVERY: Recovery = { windowMs: 60_000, pauseMs: 2_000 };

/** How often a digest still running on the loop is read back from the memory host: the pace every program polls a run at. */
export const DIGEST_POLL_EVERY_MS = 3_000;

/**
 * The most parts one chunk may carry, by the digest its store runs: the
 * loop's document digest takes `DOCUMENT_MAX_PARTS`, a space's register
 * digest `REGISTER_DIGEST_MAX_PARTS`. A chunk past the bound would be refused
 * by the host, so it is refused here first, by name.
 */
export const PARTS_PER_CHUNK_BOUND: Readonly<Record<IngestSinkKind, number>> = {
  loop: MAX_PARTS_PER_CHUNK,
  space: REGISTER_DIGEST_MAX_PARTS,
};

/**
 * Every flag, by its long name, with the type `parseArgs` reads it as and
 * what it means — the one place a flag is explained: `USAGE` in `cli.ts`
 * prints each meaning from here. Which command takes which flag is
 * `COMMANDS` in `cli.ts`.
 */
export const INGEST_FLAGS = {
  kind: {
    type: 'string',
    describe: `what the documents are: ${INGEST_KINDS.join('|')} (default ${DEFAULT_KIND})`,
  },
  subject: { type: 'string', describe: 'whom the facts are about, by name' },
  'chunk-bytes': {
    type: 'string',
    describe: `the most a rendered chunk goal may weigh, in bytes (default ${DEFAULT_CHUNK_BYTES})`,
  },
  date: { type: 'string', describe: 'the day the documents speak for, as YYYY-MM-DD' },
  scope: {
    type: 'string',
    describe: `the scope every memory of the documents takes in the loop's store, declared: ${INGEST_SCOPES.join('|')} — none bound to a unit of work, which a file never names (default: each memory scoped by the scope test, one it binds to a unit withheld and its chunk left unstored); a space writes every memory under the tenant`,
  },
  limit: { type: 'string', describe: 'post at most this many chunks, then halt, the rest pending' },
  'parts-per-chunk': {
    type: 'string',
    describe: `the most sections one chunk may carry (default ${PARTS_PER_CHUNK}; at most ${PARTS_PER_CHUNK_BOUND.space} for a space)`,
  },
  'dry-run': {
    type: 'boolean',
    describe:
      'print what would be posted (ingest) or retracted (retract); post nothing, retract nothing, record nothing',
  },
  force: {
    type: 'boolean',
    describe:
      "post again the chunks the manifest covers; a document's earlier digests are retracted once every chunk is covered again",
  },
  json: { type: 'boolean', describe: 'print the report as JSON' },
  refresh: { type: 'boolean', describe: 'read every recorded posting back from its service' },
  out: { type: 'string', describe: 'the folder the exported documents are written under' },
  space: { type: 'string', describe: 'the memory space, by the name it was ensured under' },
  tenant: {
    type: 'string',
    describe: "the tenant whose memories the command reads or forgets: the space's partition value",
  },
  under: {
    type: 'string',
    describe:
      "narrow the scope beyond the tenant's partition, as key=value pairs the space declares — project=job-assistant,unit=<hash> — comma-separated; a record is seen only by a scope that names every key it was written under",
  },
  key: { type: 'string', describe: "recall by a key a record holds, exactly — a fact's subject" },
  text: { type: 'string', describe: 'recall by meaning: the question a field asks, as a text' },
  register: { type: 'string', describe: 'narrow a recall to one register, by name' },
  reason: { type: 'string', describe: 'why the record is forgotten; kept on the record' },
} as const satisfies Record<string, { type: 'string' | 'boolean'; describe: string }>;
export type IngestFlag = keyof typeof INGEST_FLAGS;

/** One variable the program reads: its name, and what stands when it is unset — null where nothing may. */
interface EnvVariable {
  name: string;
  fallback: string | null;
}

/** The value that configures no space: a variable the space sink needs left at it is refused by name, never guessed. */
export const NONE = 'none';

export const INGEST_ENV = {
  /** The quality loop's base URL. */
  loopUrl: { name: 'QUALITY_LOOP_URL', fallback: 'http://localhost:3003' },
  /** The studio API's base URL, read by `export-studio`. */
  studioUrl: { name: 'STUDIO_API_URL', fallback: 'http://localhost:3000/api' },
  /** The directory the manifest is written under; relative to the working directory. */
  home: { name: 'MEMORY_INGEST_HOME', fallback: 'static/memory-ingest' },
  /** The default subject, so a user need not repeat their name on every run. */
  subject: { name: 'MEMORY_INGEST_SUBJECT', fallback: null },
  /** Which store the documents are posted to. */
  sink: { name: 'MEMORY_INGEST_SINK', fallback: 'loop' },
  /** The memory host's base URL, read by the space sink and the space commands. */
  memoryUrl: { name: 'AGENTIC_SYSTEM_URL', fallback: 'http://localhost:3007' },
  /** The tenant the space sink writes every document's memories under. */
  memoryTenant: { name: 'MEMORY_TENANT', fallback: NONE },
  /** The space the space sink posts to, by the name it was ensured under. */
  memorySpace: { name: 'MEMORY_SPACE_NAME', fallback: NONE },
  /** The registers a digest may file into, comma-separated. */
  memoryRegisters: { name: 'MEMORY_INGEST_REGISTERS', fallback: NONE },
} as const satisfies Record<string, EnvVariable>;

/** The space sink's settings, read only when the sink is a space. */
interface SpaceSinkConfig {
  kind: 'space';
  tenant: string;
  space: string;
  registers: readonly string[];
}

type SinkConfig = { kind: 'loop' } | SpaceSinkConfig;

export interface IngestConfig {
  loopUrl: string;
  studioUrl: string;
  home: string;
  /** Undefined when neither the environment nor the flag names one; `ingest` then refuses. */
  subject: string | undefined;
  memoryUrl: string;
  sink: SinkConfig;
}

export class IngestConfigError extends Error {
  override readonly name = 'IngestConfigError';
}

const set = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
};

/** A variable's value, or what stands when it is unset. */
const valueOf = (env: NodeJS.ProcessEnv, variable: { name: string; fallback: string }): string =>
  set(env, variable.name) ?? variable.fallback;

/** An `http(s)` URL with no path to speak of, or a refusal naming the variable. */
function serviceUrl(env: NodeJS.ProcessEnv, variable: { name: string; fallback: string }): string {
  const raw = valueOf(env, variable);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new IngestConfigError(`${variable.name} must be a URL, got ${JSON.stringify(raw)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new IngestConfigError(
      `${variable.name} must be an http(s) URL, got ${JSON.stringify(raw)}`,
    );
  }
  return raw.replace(/\/+$/, '');
}

/** The store the documents are posted to, or a refusal naming the variable. */
function sinkKind(env: NodeJS.ProcessEnv): IngestSinkKind {
  const raw = valueOf(env, INGEST_ENV.sink);
  if (!(INGEST_SINKS as readonly string[]).includes(raw)) {
    throw new IngestConfigError(
      `${INGEST_ENV.sink.name} must be one of ${INGEST_SINKS.join(', ')}, got ${raw}`,
    );
  }
  return raw as IngestSinkKind;
}

/** A variable the space sink needs, which the sink's setting makes required: its value, or a refusal naming both. */
function requiredForSpace(env: NodeJS.ProcessEnv, variable: EnvVariable): string {
  const raw = set(env, variable.name);
  if (raw === undefined || raw === NONE) {
    throw new IngestConfigError(
      `${variable.name} must be set when ${INGEST_ENV.sink.name} is space, got ${raw ?? NONE}`,
    );
  }
  return raw;
}

/** The one read of the environment. Anything it cannot use is refused here, by name. */
export function loadIngestConfig(env: NodeJS.ProcessEnv): IngestConfig {
  const kind = sinkKind(env);
  return {
    loopUrl: serviceUrl(env, INGEST_ENV.loopUrl),
    studioUrl: serviceUrl(env, INGEST_ENV.studioUrl),
    home: valueOf(env, INGEST_ENV.home),
    subject: subjectName(set(env, INGEST_ENV.subject.name), INGEST_ENV.subject.name),
    memoryUrl: serviceUrl(env, INGEST_ENV.memoryUrl),
    sink:
      kind === 'loop'
        ? { kind }
        : {
            kind,
            tenant: tenantName(
              requiredForSpace(env, INGEST_ENV.memoryTenant),
              INGEST_ENV.memoryTenant.name,
            ),
            space: spaceName(
              requiredForSpace(env, INGEST_ENV.memorySpace),
              INGEST_ENV.memorySpace.name,
            ),
            registers: registerNames(
              requiredForSpace(env, INGEST_ENV.memoryRegisters),
              INGEST_ENV.memoryRegisters.name,
            ),
          },
  };
}

/**
 * Whom the facts are about, within the contract's bound on a subject — or a
 * refusal naming where the value came from (the flag or the variable), so a
 * subject the chunk schema would reject is refused before any document is read.
 */
export function subjectName(raw: string | undefined, source: string): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > DOCUMENT_SUBJECT_MAX_LENGTH) {
    throw new IngestConfigError(
      `${source} must name the subject in 1 to ${DOCUMENT_SUBJECT_MAX_LENGTH} characters, got ${trimmed.length}`,
    );
  }
  return trimmed;
}

/** A space's name in the contract's grammar, or a refusal naming where the value came from. */
export function spaceName(raw: string, source: string): string {
  const parsed = spaceNameSchema.safeParse(raw.trim());
  if (!parsed.success) {
    throw new IngestConfigError(
      `${source} must name a memory space: ${parsed.error.issues[0]?.message}`,
    );
  }
  return parsed.data;
}

/** A tenant, the value of the space's partition key: anything but blank or `none`, or a refusal naming where it came from. */
export function tenantName(raw: string, source: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed === NONE) {
    throw new IngestConfigError(`${source} must name the tenant, got ${JSON.stringify(raw)}`);
  }
  return trimmed;
}

/** The most characters a register's name may run to, as a lenient read of a strategy keeps one. */
const REGISTER_NAME_MAX_LENGTH = keptAtMost(REGISTER_NAME_BOUND);

/** One register's name within the contract's bound, or a refusal naming where it came from. */
export function registerName(raw: string, source: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > REGISTER_NAME_MAX_LENGTH) {
    throw new IngestConfigError(
      `${source} must name a register in 1 to ${REGISTER_NAME_MAX_LENGTH} characters, got ${JSON.stringify(raw)}`,
    );
  }
  return trimmed;
}

/** Comma-separated register names, each within bound and named once, no more than a request may name. */
export function registerNames(raw: string, source: string): string[] {
  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => registerName(name, source));
  if (names.length === 0 || names.length > STRATEGY_REGISTERS_BOUND.ceiling) {
    throw new IngestConfigError(
      `${source} must name 1 to ${STRATEGY_REGISTERS_BOUND.ceiling} registers, comma-separated, got ${JSON.stringify(raw)}`,
    );
  }
  if (new Set(names).size !== names.length) {
    throw new IngestConfigError(`${source} names a register twice: ${raw}`);
  }
  return names;
}
