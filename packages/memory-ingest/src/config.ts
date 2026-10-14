import {
  DOCUMENT_SUBJECT_MAX_LENGTH,
  GOAL_BUDGET_BYTES,
  MEMORY_SCOPES,
  type DocumentKind,
  type MemoryScope,
  type Recovery,
} from '@sysdesign/contracts';

import { MAX_PARTS_PER_CHUNK, PARTS_PER_CHUNK } from './core/chunk';

/**
 * The ingester's configuration, declared once.
 *
 * Every flag the command line takes and every environment variable the
 * program reads is named here as data; `cli.ts` builds its parser from the
 * flags and `loadIngestConfig` is the one read of the environment. A value
 * that cannot be used is refused by name, never defaulted around.
 */

/** The document kinds a user ingests; `guidance` is the browser session's and never comes from a file. */
export const INGEST_KINDS = ['resume', 'notes'] as const satisfies readonly DocumentKind[];
export type IngestKind = (typeof INGEST_KINDS)[number];
export const DEFAULT_KIND: IngestKind = 'notes';

/** How large a rendered chunk goal may grow; well under the engine's budget so a digest reads one screen of facts. */
export const DEFAULT_CHUNK_BYTES = 6000;
export const DEFAULT_LOOP_URL = 'http://localhost:3003';
/** The studio API, from which `export-studio` writes the subject's own experience profiles and STAR stories as documents. */
export const DEFAULT_STUDIO_URL = 'http://localhost:3000/api';
/** Where the manifest lives, under the working directory. */
export const DEFAULT_HOME = 'static/memory-ingest';

/**
 * How long a call to the loop rides out a loop that is restarting before its
 * failure stands: a call that never reached it, or a read or a retraction it
 * answered with a server error, is asked again every 2 s for 60 s — ten times
 * the six seconds within which each of fifteen watch-mode restarts of the
 * loop, measured on 2026-10-10, listened again, so several restarts back to
 * back are ridden out too. A start still unreachable past the window stops
 * the run.
 */
export const INGEST_LOOP_RECOVERY: Recovery = { windowMs: 60_000, pauseMs: 2_000 };

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
    describe: `the scope every memory of the documents takes, declared: ${MEMORY_SCOPES.join('|')} (default: each memory scoped by the scope test)`,
  },
  limit: { type: 'string', describe: 'post at most this many chunks, then halt, the rest pending' },
  'parts-per-chunk': {
    type: 'string',
    describe: `the most sections one chunk may carry (default ${PARTS_PER_CHUNK})`,
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
  refresh: { type: 'boolean', describe: 'read every recorded orchestration back from the loop' },
  out: { type: 'string', describe: 'the folder the exported documents are written under' },
} as const satisfies Record<string, { type: 'string' | 'boolean'; describe: string }>;
export type IngestFlag = keyof typeof INGEST_FLAGS;

export const INGEST_ENV = {
  /** The quality loop's base URL. */
  loopUrl: 'QUALITY_LOOP_URL',
  /** The studio API's base URL, read by `export-studio`. */
  studioUrl: 'STUDIO_API_URL',
  /** The directory the manifest is written under; relative to the working directory. */
  home: 'MEMORY_INGEST_HOME',
  /** The default subject, so a user need not repeat their name on every run. */
  subject: 'MEMORY_INGEST_SUBJECT',
} as const;

export interface IngestConfig {
  loopUrl: string;
  studioUrl: string;
  home: string;
  /** Undefined when neither the environment nor the flag names one; `ingest` then refuses. */
  subject: string | undefined;
}

export class IngestConfigError extends Error {
  override readonly name = 'IngestConfigError';
}

const set = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
};

/** An `http(s)` URL with no path to speak of, or a refusal naming the variable. */
function serviceUrl(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const raw = set(env, name);
  if (raw === undefined) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new IngestConfigError(`${name} must be a URL, got ${JSON.stringify(raw)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new IngestConfigError(`${name} must be an http(s) URL, got ${JSON.stringify(raw)}`);
  }
  return raw.replace(/\/+$/, '');
}

/** The one read of the environment. Anything it cannot use is refused here, by name. */
export function loadIngestConfig(env: NodeJS.ProcessEnv): IngestConfig {
  return {
    loopUrl: serviceUrl(env, INGEST_ENV.loopUrl, DEFAULT_LOOP_URL),
    studioUrl: serviceUrl(env, INGEST_ENV.studioUrl, DEFAULT_STUDIO_URL),
    home: set(env, INGEST_ENV.home) ?? DEFAULT_HOME,
    subject: subjectName(set(env, INGEST_ENV.subject), INGEST_ENV.subject),
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

/** A chunk budget: a positive integer of bytes no larger than the engine's own goal budget. */
export function chunkBytes(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_CHUNK_BYTES;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) <= 0 || Number(raw) > GOAL_BUDGET_BYTES) {
    throw new IngestConfigError(
      `--chunk-bytes must be a positive integer no larger than ${GOAL_BUDGET_BYTES}, got ${JSON.stringify(raw)}`,
    );
  }
  return Number(raw);
}

/**
 * The day a document speaks for, as the contract spells a day — or a refusal
 * naming the flag. Undated is legitimate and is what a document that says
 * nothing gets; a figure like a span of experience is only absolute against
 * the day it was written, so a corpus that knows its date says so.
 */
export function documentDate(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new IngestConfigError(`--date must be a day as YYYY-MM-DD, got ${JSON.stringify(raw)}`);
  }
  return trimmed;
}

/**
 * How many sections one chunk may carry, or a refusal naming the flag. Lower
 * it when a chunk's sections state more facts than the contract's memory cap
 * allows the digest to propose — the remainder is dropped silently otherwise.
 */
export function partsPerChunk(raw: string | undefined): number {
  if (raw === undefined) return PARTS_PER_CHUNK;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) <= 0 || Number(raw) > MAX_PARTS_PER_CHUNK) {
    throw new IngestConfigError(
      `--parts-per-chunk must be a positive integer no larger than ${MAX_PARTS_PER_CHUNK}, got ${JSON.stringify(raw)}`,
    );
  }
  return Number(raw);
}

/** How many chunks one run may post, or a refusal naming the flag. */
export function postLimit(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) <= 0) {
    throw new IngestConfigError(`--limit must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return Number(raw);
}

/** The scope the documents declare for every memory they state, null when they declare none, or a refusal naming the choices. */
export function documentScope(raw: string | undefined): MemoryScope | null {
  if (raw === undefined) return null;
  if (!(MEMORY_SCOPES as readonly string[]).includes(raw)) {
    throw new IngestConfigError(`--scope must be one of ${MEMORY_SCOPES.join(', ')}, got ${raw}`);
  }
  return raw as MemoryScope;
}

/** A document kind the ingester takes, or a refusal naming the choices. */
export function ingestKind(raw: string | undefined): IngestKind {
  if (raw === undefined) return DEFAULT_KIND;
  if (!INGEST_KINDS.includes(raw as IngestKind)) {
    throw new IngestConfigError(`--kind must be one of ${INGEST_KINDS.join(', ')}, got ${raw}`);
  }
  return raw as IngestKind;
}
