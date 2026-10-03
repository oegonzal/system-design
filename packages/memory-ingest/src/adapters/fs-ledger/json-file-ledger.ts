import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DOCUMENT_KINDS, ORCHESTRATION_STEP_STATUSES } from '@sysdesign/contracts';
import { z } from 'zod';

import {
  DOCUMENT_MEMORY_STEPS,
  INGEST_STATUSES,
  type IngestLedger,
  type ManifestEntry,
} from '../../core/ports';

export const MANIFEST_FILE = 'manifest.json';
const MANIFEST_VERSION = 1;

const stepSchema = z
  .object({
    status: z.enum(ORCHESTRATION_STEP_STATUSES),
    reason: z.string().nullable(),
    note: z.string().nullable(),
    counts: z.record(z.string(), z.number()),
  })
  .nullable();

/** The file's shape, so a manifest another program or an older build wrote is refused rather than misread. */
const entrySchema = z.object({
  chunkHash: z.string().min(1),
  document: z.string().min(1),
  chunk: z.object({ index: z.number().int().min(1), of: z.number().int().min(1) }),
  kind: z.enum(DOCUMENT_KINDS),
  orchestrationRunId: z.string().nullable(),
  digestRunId: z.string().nullable(),
  status: z.enum(INGEST_STATUSES),
  steps: z.object(
    Object.fromEntries(DOCUMENT_MEMORY_STEPS.map((id) => [id, stepSchema])) as Record<
      (typeof DOCUMENT_MEMORY_STEPS)[number],
      typeof stepSchema
    >,
  ),
  error: z.string().nullable(),
  ingestedAt: z.string().min(1),
  loopUrl: z.string().min(1),
});

const manifestSchema = z.object({
  version: z.literal(MANIFEST_VERSION),
  entries: z.array(entrySchema),
});

export class ManifestUnreadable extends Error {
  override readonly name = 'ManifestUnreadable';
  constructor(
    readonly path: string,
    detail: string,
  ) {
    super(`${path} is not a manifest this build can read: ${detail}`);
  }
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/**
 * The manifest as one JSON file under the ingest home. A save writes the
 * whole file through a temp name and a rename, so a process killed mid-write
 * leaves the previous manifest whole, never a truncated one. No file is an
 * empty ledger.
 */
export class JsonFileLedger implements IngestLedger {
  readonly path: string;

  constructor(private readonly home: string) {
    this.path = join(home, MANIFEST_FILE);
  }

  async load(): Promise<readonly ManifestEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if (isMissing(error)) return [];
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
}
