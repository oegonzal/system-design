/**
 * `main.js import-qdrant [--from <url>] [--collection <name>] [--dry-run] [--force]`
 *
 * The one-time carry-over of the quality-memory collection from the Qdrant
 * that held it before the pgvector move (2026-11-12) into the table the store
 * keeps in the stack's database: every point scrolled with its payload and
 * both named vectors, written under the id it had — `memory_support.point_id`
 * names those ids — so nothing downstream changes. Calls no model and needs
 * no embedding key: `--collection` names the collection, whose name says
 * which model and width the store is built for; without it the store is
 * bound as the service binds it, to the configured embedding client. No
 * Qdrant client: the scroll is one REST body over `fetch`, a page at a time.
 *
 * For a store the loop has not written to since the move: the import only
 * adds and replaces by id, so run over a table the loop has worked on it
 * would bring back the refs the loop has since replaced. A table that already
 * holds chunks is refused unless `--force` is given. `--dry-run` checks every
 * point and writes nothing — not even the table, which the service makes at
 * boot: a table not there yet is read as holding nothing, never made. Prints
 * what was scanned, imported and refused, the first refusal and the time
 * taken; exits 1 when anything was refused (not under `--dry-run`), and 2 on
 * a flag it does not know or cannot read, before anything boots.
 */
import { parseArgs } from 'node:util';

import { EntityManager } from '@mikro-orm/postgresql';
import { NestFactory } from '@nestjs/core';
import { errorMessage } from '@sysdesign/contracts';
import { mikroOrmExecutor } from '@sysdesign/db';
import { createEmbeddingClientFromEnv } from '@sysdesign/llm';
import { z } from 'zod';

import { ImportQdrantModule } from '../modules/app/import-qdrant.module';
import { collectionName } from '../modules/memory/pgvector/collection';
import {
  PgvectorMemoryStore,
  type ImportedPoint,
} from '../modules/memory/pgvector/pgvector-memory-store';

const USAGE = 'usage: import-qdrant [--from <url>] [--collection <name>] [--dry-run] [--force]';
const DEFAULT_FROM = 'http://localhost:6333';
/** Points per scroll page: a page of 1536-wide pairs is a few megabytes of JSON, read whole. */
const PAGE = 256;

/** The flags as the command reads them. */
interface Flags {
  from: URL;
  collection: string | undefined;
  dryRun: boolean;
  force: boolean;
}

/** The flags declared once: `parseArgs` is strict, so a flag not here is its error to name. */
const parseFlags = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    options: {
      from: { type: 'string', default: DEFAULT_FROM },
      collection: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  }).values;

/** The flags read, or why they could not be: a flag the command does not know, a value missing, a `--from` that is not a URL. */
function readFlags(argv: readonly string[]): Flags | string {
  let values: ReturnType<typeof parseFlags>;
  try {
    values = parseFlags(argv);
  } catch (error) {
    return errorMessage(error);
  }
  let from: URL;
  try {
    from = new URL(values.from.endsWith('/') ? values.from : `${values.from}/`);
  } catch {
    return `--from ${values.from} is not a URL`;
  }
  return { from, collection: values.collection, dryRun: values['dry-run'], force: values.force };
}

/** The model and width a collection name states, as the store binds them. */
interface Binding {
  model: string;
  dimensions: number;
}

/**
 * `<store>__<generation>__<model>__<dims>` read back: the model is whatever
 * sits between the generation and the width (its safe form, which is what
 * the store names a collection by too), and the name must then be exactly
 * the one this store derives — another store's or generation's collection is
 * refused by name rather than written into a table it does not belong to.
 */
function bindingOf(collection: string): Binding | string {
  const match = /^(.+?)__(.+?)__(.+)__(\d+)$/.exec(collection);
  if (match === null) {
    return `collection ${collection} is not named <store>__<generation>__<model>__<dims>`;
  }
  const binding = { model: match[3], dimensions: parseInt(match[4], 10) };
  const own = collectionName(binding.model, binding.dimensions);
  if (own !== collection) {
    return `collection ${collection} is not this store's: a quality-memory collection of its generation is named ${own}`;
  }
  return binding;
}

/** The binding the flags name, or the configured embedding client's; a string says why there is none. */
function bindingFor(flags: Flags): Binding | string {
  if (flags.collection !== undefined) return bindingOf(flags.collection);
  const client = createEmbeddingClientFromEnv();
  if (client.model === null) {
    return `no embedding client is configured (${client.reason ?? 'disabled'}): name the collection with --collection`;
  }
  return { model: client.model, dimensions: client.dimensions };
}

/** One page of a scroll, as Qdrant's REST answers it; a point's vectors by name. */
const pageSchema = z.object({
  result: z.object({
    points: z.array(
      z.object({
        id: z.union([z.string(), z.number()]),
        payload: z.unknown(),
        vector: z.record(z.string(), z.array(z.number())),
      }),
    ),
    next_page_offset: z.union([z.string(), z.number()]).nullable().optional(),
  }),
});

/** The next page of points after `offset` (none for the first), and where the page after it starts. */
async function scroll(
  from: URL,
  collection: string,
  offset: string | number | null,
): Promise<{ points: ImportedPoint[]; next: string | number | null }> {
  const url = new URL(`collections/${encodeURIComponent(collection)}/points/scroll`, from);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      limit: PAGE,
      ...(offset === null ? {} : { offset }),
      with_payload: true,
      with_vector: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`qdrant at ${from.origin} answered ${response.status} for ${collection}`);
  }
  const page = pageSchema.safeParse(await response.json());
  if (!page.success) {
    throw new Error(
      `the scroll of ${collection} is not pages of points with named vectors: ${page.error.issues[0]?.message ?? 'unreadable'}`,
    );
  }
  return {
    points: page.data.result.points.map((point) => ({
      id: String(point.id),
      payload: point.payload,
      vectors: point.vector,
    })),
    next: page.data.result.next_page_offset ?? null,
  };
}

/**
 * How many chunks the store holds before anything is written, printed, or
 * why it cannot be known. A dry run makes nothing, so it reads the table as
 * it stands — one not there yet holds nothing — where a real run makes sure
 * of the table first, as the service does at boot.
 */
async function chunksBefore(
  store: PgvectorMemoryStore,
  collection: string,
  dryRun: boolean,
): Promise<number | string> {
  if (dryRun) {
    const held = await store.held();
    const chunks = held.table === 'absent' ? 0 : held.chunks;
    console.log(
      `memory store: ${collection} (${held.table === 'absent' ? 'table absent, 0' : chunks} chunks before) — dry run, nothing is written, not even the table`,
    );
    return chunks;
  }
  const before = await store.verify();
  if (!before.ready) {
    return `memory store not ready: ${before.reason ?? 'unknown'} — ${before.note ?? ''}`;
  }
  console.log(`memory store: ${collection} (${before.chunks} chunks before)`);
  return before.chunks;
}

export async function importQdrantCli(argv: readonly string[]): Promise<number> {
  const flags = readFlags(argv);
  if (typeof flags === 'string') {
    console.error(`${USAGE}\n${flags}`);
    return 2;
  }
  const binding = bindingFor(flags);
  if (typeof binding === 'string') {
    console.error(`${USAGE}\n${binding}`);
    return 2;
  }
  const collection = collectionName(binding.model, binding.dimensions);

  const started = Date.now();
  const app = await NestFactory.createApplicationContext(ImportQdrantModule, {
    logger: ['error', 'warn'],
  });
  try {
    const store = new PgvectorMemoryStore(
      mikroOrmExecutor(app.get(EntityManager)),
      binding.model,
      binding.dimensions,
    );
    const before = await chunksBefore(store, collection, flags.dryRun);
    if (typeof before === 'string') {
      console.error(before);
      return 1;
    }
    if (before > 0 && !flags.force) {
      console.error(
        `memory store: ${collection} already holds ${before} chunks. The import is for a store the loop has not written to since the move: ` +
          'run over one it has worked on, it would bring back the refs the loop has since replaced. Pass --force to write over what it holds.',
      );
      return 1;
    }
    let scanned = 0;
    let imported = 0;
    const refused: { id: string; reason: string }[] = [];
    let offset: string | number | null = null;
    do {
      const page = await scroll(flags.from, collection, offset);
      scanned += page.points.length;
      const outcome = await store.importPoints(page.points, { dryRun: flags.dryRun });
      imported += outcome.imported;
      refused.push(...outcome.refused);
      offset = page.points.length === 0 ? null : page.next;
    } while (offset !== null);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `scanned ${scanned} imported ${imported} refused ${refused.length} in ${seconds} s`,
    );
    const first = refused[0];
    if (first !== undefined) console.log(`first refusal: ${first.reason}`);
    if (!flags.dryRun) {
      const after = await store.verify();
      console.log(`memory store: ${collection} (${after.chunks} chunks after)`);
    }
    return refused.length > 0 && !flags.dryRun ? 1 : 0;
  } finally {
    await app.close();
  }
}
