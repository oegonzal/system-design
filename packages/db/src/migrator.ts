/**
 * Where this workspace keeps its migrations and records which ran, declared
 * once for every reader: the migration CLI (`mikro-orm.config.ts`) and the
 * test databases (`ensureDatabase`) apply them with `migratorSettings`, and an
 * app checks with `assertMigrated` that its database applied them all before
 * it reads or writes a row. A checkout ahead of its database then stops by
 * naming the migrations to apply, instead of failing on the first column the
 * database does not have.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { EntityManager } from '@mikro-orm/postgresql';

/** The migrations folder, from the workspace root. */
export const MIGRATIONS_DIR = join('packages', 'db', 'src', 'migrations');

/** The table the migrator records each applied migration in, by name. */
const MIGRATIONS_TABLE = 'mikro_orm_migrations';

/** The migrator's settings for the workspace at `workspaceRoot`. */
export const migratorSettings = (workspaceRoot: string) => ({
  path: join(workspaceRoot, MIGRATIONS_DIR),
  tableName: MIGRATIONS_TABLE,
  transactional: true,
  allOrNothing: true,
  snapshot: false,
});

/** A database that has not applied every migration this checkout carries. */
export class MigrationsPending extends Error {
  override readonly name = 'MigrationsPending';
  constructor(
    readonly database: string,
    readonly pending: readonly string[],
  ) {
    super(
      `database ${database} has not applied ${pending.length} migration(s) this checkout carries: ${pending.join(', ')} — run \`DB_NAME=${database} pnpm db:migrate\``,
    );
  }
}

/**
 * The migrations in `dir`, named as the migrator records them: it reads every
 * script but a type declaration (`!(*.d).{js,ts,cjs}`) and records a name
 * without its `.js` or `.ts` — a `.cjs` keeps its suffix, exactly as
 * `MigrationStorage.getMigrationName` writes it to the table.
 */
const migrationsIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter((file) => /\.(js|ts|cjs)$/.test(file) && !file.endsWith('.d.ts'))
    .map((file) => file.replace(/\.[jt]s$/, ''))
    .sort();

/**
 * Refuses a database that has not applied every migration in the workspace —
 * what `pnpm db:migrate` would run — naming each one. It asks the connection
 * which database it is actually on, and reads the migrator's own table; a
 * database the migrator never touched has applied none. A relative
 * `workspaceRoot` resolves against the working directory, as every path the
 * apps read does.
 */
export async function assertMigrated(em: EntityManager, workspaceRoot = '.'): Promise<void> {
  const connection = em.fork().getConnection();
  const { name, recorded } = await connection.execute<{ name: string; recorded: boolean }>(
    `select current_database() as name, to_regclass('${MIGRATIONS_TABLE}') is not null as recorded`,
    [],
    'get',
  );
  const applied = recorded
    ? (
        await connection.execute<{ name: string }[]>(
          `select name from ${MIGRATIONS_TABLE}`,
          [],
          'all',
        )
      ).map((row) => row.name)
    : [];
  const pending = migrationsIn(join(workspaceRoot, MIGRATIONS_DIR)).filter(
    (migration) => !applied.includes(migration),
  );
  if (pending.length > 0) throw new MigrationsPending(name, pending);
}
