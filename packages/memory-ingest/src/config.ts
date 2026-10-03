import {
  DOCUMENT_SUBJECT_MAX_LENGTH,
  GOAL_BUDGET_BYTES,
  type DocumentKind,
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
/** Where the manifest lives, under the working directory. */
export const DEFAULT_HOME = 'static/memory-ingest';

/**
 * Every flag, by its long name, with the type `parseArgs` reads it as. Which
 * command takes which flag is `COMMANDS` in `cli.ts`; the meaning is here.
 */
export const INGEST_FLAGS = {
  kind: { type: 'string', describe: `what the documents are: ${INGEST_KINDS.join('|')}` },
  subject: { type: 'string', describe: 'whom the facts are about, by name' },
  'chunk-bytes': { type: 'string', describe: 'the most a rendered chunk goal may weigh' },
  date: { type: 'string', describe: 'the day the documents speak for, as YYYY-MM-DD' },
  limit: { type: 'string', describe: 'post at most this many chunks, then halt' },
  'parts-per-chunk': { type: 'string', describe: 'the most sections one chunk may carry' },
  'dry-run': { type: 'boolean', describe: 'print the chunks; post nothing, record nothing' },
  force: { type: 'boolean', describe: 'post chunks the manifest already holds as complete' },
  json: { type: 'boolean', describe: 'print the report as JSON' },
  refresh: { type: 'boolean', describe: 'read every recorded orchestration back from the loop' },
} as const satisfies Record<string, { type: 'string' | 'boolean'; describe: string }>;
export type IngestFlag = keyof typeof INGEST_FLAGS;

export const INGEST_ENV = {
  /** The quality loop's base URL. */
  loopUrl: 'QUALITY_LOOP_URL',
  /** The directory the manifest is written under; relative to the working directory. */
  home: 'MEMORY_INGEST_HOME',
  /** The default subject, so a user need not repeat their name on every run. */
  subject: 'MEMORY_INGEST_SUBJECT',
} as const;

export interface IngestConfig {
  loopUrl: string;
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
function loopUrl(env: NodeJS.ProcessEnv): string {
  const raw = set(env, INGEST_ENV.loopUrl);
  if (raw === undefined) return DEFAULT_LOOP_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new IngestConfigError(`${INGEST_ENV.loopUrl} must be a URL, got ${JSON.stringify(raw)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new IngestConfigError(
      `${INGEST_ENV.loopUrl} must be an http(s) URL, got ${JSON.stringify(raw)}`,
    );
  }
  return raw.replace(/\/+$/, '');
}

/** The one read of the environment. Anything it cannot use is refused here, by name. */
export function loadIngestConfig(env: NodeJS.ProcessEnv): IngestConfig {
  return {
    loopUrl: loopUrl(env),
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

/** A document kind the ingester takes, or a refusal naming the choices. */
export function ingestKind(raw: string | undefined): IngestKind {
  if (raw === undefined) return DEFAULT_KIND;
  if (!INGEST_KINDS.includes(raw as IngestKind)) {
    throw new IngestConfigError(`--kind must be one of ${INGEST_KINDS.join(', ')}, got ${raw}`);
  }
  return raw as IngestKind;
}
