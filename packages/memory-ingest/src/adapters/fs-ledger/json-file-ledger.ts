import { rmSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DOCUMENT_KINDS,
  ORCHESTRATION_STEP_STATUSES,
  recordScopeSchema,
} from '@sysdesign/contracts';
import { z } from 'zod';

import {
  INGEST_SINKS,
  INGEST_STATUSES,
  POSTING_STEPS,
  type IngestLedger,
  type ManifestEntry,
} from '../../core/ports';

export const MANIFEST_FILE = 'manifest.json';
/** Beside the manifest while a command writes the home. */
export const LOCK_FILE = 'manifest.lock';
/**
 * The version this build writes. 2 added the retraction marks; 3 the store a
 * posting went through — the sink, the service, the space and the records it
 * left; 4 the scope a space posting wrote under, which tells one tenant's
 * postings from another's in one space. A build that reads only an earlier
 * version refuses the file by this literal, rather than load it, drop what it
 * does not know and save the postings as it misread them.
 */
const MANIFEST_VERSION = 4;

const stepSchema = z
  .object({
    status: z.enum(ORCHESTRATION_STEP_STATUSES),
    reason: z.string().nullable(),
    note: z.string().nullable(),
    counts: z.record(z.string(), z.number()),
  })
  .nullable();

/** What every version records of a posting's chunk and outcome. */
const postingShape = {
  chunkHash: z.string().min(1),
  document: z.string().min(1),
  chunk: z.object({ index: z.number().int().min(1), of: z.number().int().min(1) }),
  kind: z.enum(DOCUMENT_KINDS),
  orchestrationRunId: z.string().nullable(),
  digestRunId: z.string().nullable(),
  status: z.enum(INGEST_STATUSES),
  steps: z.object(
    Object.fromEntries(POSTING_STEPS.map((id) => [id, stepSchema])) as Record<
      (typeof POSTING_STEPS)[number],
      typeof stepSchema
    >,
  ),
  error: z.string().nullable(),
  ingestedAt: z.string().min(1),
};

/** The marks version 2 added. */
const markShape = {
  retractedAt: z.string().min(1).nullable(),
  retractedPoints: z.number().int().min(0).nullable(),
};

/** Where a posting went, as version 3 records it. */
const originShape = {
  sink: z.enum(INGEST_SINKS),
  host: z.string().min(1),
  spaceId: z.string().min(1).nullable(),
  recordIds: z.array(z.string().min(1)),
};

/** The scope a space posting wrote under, as version 4 records it; null for a loop posting. */
const scopeShape = { scope: recordScopeSchema.nullable() };

/** Every posting before version 3 went through the loop, under the URL it recorded as `loopUrl`, named no records and wrote under no scope. */
const fromLoopPosting = <T extends { loopUrl: string }>({ loopUrl, ...posting }: T) => ({
  ...posting,
  sink: 'loop' as const,
  host: loopUrl,
  spaceId: null,
  scope: null,
  recordIds: [],
});

/**
 * A version-3 posting recorded no scope: a loop posting had none, and a space
 * posting's reads as none — which no store matches, so it is listed and acted
 * on by no command — rather than as the configured tenant's, which it may not
 * have been.
 */
const withoutScope = <T>(posting: T) => ({ ...posting, scope: null });

/**
 * The file's shape, by version, so a manifest another program or a newer
 * build wrote is refused rather than misread. Version 1 was written before
 * retractions were marked, so each of its postings reads as standing; versions
 * 1 and 2 were written before a posting could go anywhere but the loop; 3
 * before a space posting recorded the scope it wrote under.
 */
const manifestSchema = z.discriminatedUnion('version', [
  z.object({
    version: z.literal(1),
    entries: z.array(
      z.object({ ...postingShape, loopUrl: z.string().min(1) }).transform((entry) => ({
        ...fromLoopPosting(entry),
        retractedAt: null,
        retractedPoints: null,
      })),
    ),
  }),
  z.object({
    version: z.literal(2),
    entries: z.array(
      z
        .object({ ...postingShape, ...markShape, loopUrl: z.string().min(1) })
        .transform(fromLoopPosting),
    ),
  }),
  z.object({
    version: z.literal(3),
    entries: z.array(
      z.object({ ...postingShape, ...markShape, ...originShape }).transform(withoutScope),
    ),
  }),
  z.object({
    version: z.literal(MANIFEST_VERSION),
    entries: z.array(z.object({ ...postingShape, ...markShape, ...originShape, ...scopeShape })),
  }),
]);

export class ManifestUnreadable extends Error {
  override readonly name = 'ManifestUnreadable';
  constructor(
    readonly path: string,
    detail: string,
  ) {
    super(`${path} is not a manifest this build can read: ${detail}`);
  }
}

/** A home another command is writing: refused, naming the lock file, so its record is not overwritten. */
export class ManifestLocked extends Error {
  override readonly name = 'ManifestLocked';
  constructor(readonly path: string) {
    super(
      `${path} exists: another memory-ingest command is writing this manifest — run again once it ends, or delete the file if none is running`,
    );
  }
}

const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code;

/**
 * The manifest as one JSON file under the ingest home. A save writes the
 * whole file through a temp name and a rename, so a process killed mid-write
 * leaves the previous manifest whole, never a truncated one. No file is an
 * empty ledger. The lock is a file created exclusively beside it and removed
 * on release — and when the process exits without releasing, as a second
 * interrupt or an uncaught fault makes it; only a process killed outright
 * leaves one behind, which the refusal names.
 */
export class JsonFileLedger implements IngestLedger {
  readonly path: string;
  private readonly lockPath: string;

  constructor(private readonly home: string) {
    this.path = join(home, MANIFEST_FILE);
    this.lockPath = join(home, LOCK_FILE);
  }

  async load(): Promise<readonly ManifestEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return [];
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new ManifestUnreadable(this.path, (error as Error).message);
    }
    const result = manifestSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new ManifestUnreadable(
        this.path,
        issue ? `${issue.path.join('.')}: ${issue.message}` : 'does not match the schema',
      );
    }
    return result.data.entries;
  }

  async save(entries: readonly ManifestEntry[]): Promise<void> {
    await mkdir(this.home, { recursive: true });
    const temp = `${this.path}.tmp`;
    await writeFile(
      temp,
      `${JSON.stringify({ version: MANIFEST_VERSION, entries }, null, 2)}\n`,
      'utf8',
    );
    await rename(temp, this.path);
  }

  async lock(): Promise<() => Promise<void>> {
    await mkdir(this.home, { recursive: true });
    try {
      await writeFile(this.lockPath, '', { flag: 'wx' });
    } catch (error) {
      if (hasCode(error, 'EEXIST')) throw new ManifestLocked(this.lockPath);
      throw error;
    }
    const releaseOnExit = (): void => rmSync(this.lockPath, { force: true });
    process.once('exit', releaseOnExit);
    return async () => {
      process.removeListener('exit', releaseOnExit);
      await rm(this.lockPath, { force: true });
    };
  }
}
