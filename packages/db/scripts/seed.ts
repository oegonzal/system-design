/**
 * Loads the committed experience fixture into the database through
 * `seedExperiences`, the one seeder the studio's test harness calls too.
 *
 * Idempotent: it upserts every fixture row in place by its pinned UUID and
 * deletes nothing. Safe to run on every `tilt up`.
 *
 *     node -r @swc-node/register packages/db/scripts/seed.ts
 *
 * `@swc-node/register` rather than tsx: loading the entities evaluates their
 * decorators, and `ReflectMetadataProvider` needs `emitDecoratorMetadata`,
 * which esbuild (and therefore tsx) does not implement.
 */
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config';
import { ExperienceProfile } from '../src/entities/experience-profile.entity';
import { seedExperiences } from '../src/seed/seed-experiences';

async function main(): Promise<void> {
  // debug: false — the shared config turns SQL logging on, which would bury
  // the one-line summary under a page of statements.
  const orm = await MikroORM.init({ ...config, debug: false });

  try {
    const em = orm.em.fork();
    const seeded = await seedExperiences(em);
    const total = await em.count(ExperienceProfile);
    console.log(`seeded ${seeded} experiences · table now holds ${total} rows`);
  } finally {
    await orm.close(true);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
