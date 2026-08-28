/**
 * Loads the committed experience fixture into the database.
 *
 * Idempotent: `upsertMany` keys on the primary key, and the fixture pins its
 * UUIDs, so re-running updates in place rather than failing on a duplicate.
 * Safe to run on every `tilt up`.
 *
 *     node -r @swc-node/register packages/db/scripts/seed.ts
 *
 * `@swc-node/register` rather than tsx: loading the entities evaluates their
 * decorators, and `ReflectMetadataProvider` needs `emitDecoratorMetadata`,
 * which esbuild (and therefore tsx) does not implement.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MikroORM } from '@mikro-orm/postgresql';
import type * as Contracts from '@sysdesign/contracts';

import config from '../mikro-orm.config';
import { ExperienceProfile } from '../src/entities/experience-profile.entity';

const FIXTURE = join(__dirname, '../src/seed/experiences.fixture.json');

// Local tuple + `satisfies` against the contract, because `@swc-node/register`
// cannot resolve the `@sysdesign/contracts` alias to a CommonJS module — the
// same pattern the entities use.
type ContractArchetypes = (typeof Contracts)['ARCHETYPES'];
const ARCHETYPES = [
  'flash-sale-ticketing',
  'media-streaming-pipeline',
  'workflow-automation',
  'realtime-analytics',
  'dag-orchestration',
] as const satisfies ContractArchetypes;

interface FixtureRow {
  id: string;
  slug: string;
  companyLabel: string;
  title: string;
  summary: string;
  archetype: Contracts.Archetype;
  techStack: string[];
  scaleFacts: Contracts.ScaleFacts;
  highlights: string[];
}

function loadFixture(): FixtureRow[] {
  const rows = JSON.parse(readFileSync(FIXTURE, 'utf8')) as FixtureRow[];

  // Fail loudly rather than half-seeding: the generator templates key off
  // `archetype`, so a bad row would surface much later as a missing template.
  const bad = rows.filter(
    (row) =>
      !row.id ||
      !row.slug ||
      !row.title ||
      !(ARCHETYPES as readonly string[]).includes(row.archetype) ||
      row.techStack.length === 0 ||
      row.highlights.length === 0,
  );
  if (bad.length > 0) {
    throw new Error(`fixture has ${bad.length} invalid row(s), first slug=${bad[0]?.slug}`);
  }

  return rows;
}

async function main(): Promise<void> {
  const rows = loadFixture();

  // debug: false — the shared config turns SQL logging on, which would bury
  // the one-line summary under a page of statements.
  const orm = await MikroORM.init({ ...config, debug: false });

  try {
    const em = orm.em.fork();
    // `upsertMany` takes plain data, so property initializers never run —
    // `createdAt` must be supplied here. It is excluded from the conflict
    // update so re-seeding refreshes content without rewriting history.
    await em.upsertMany(
      ExperienceProfile,
      rows.map((row) => ({ ...row, createdAt: new Date() })),
      { onConflictExcludeFields: ['createdAt'] },
    );
    await em.flush();

    const total = await em.count(ExperienceProfile);
    console.log(`seeded ${rows.length} experiences · table now holds ${total} rows`);
  } finally {
    await orm.close(true);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
