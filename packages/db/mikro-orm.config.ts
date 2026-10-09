import { join } from 'path';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';

import { migratorSettings } from './src/migrator';
import { ormOptions } from './src/orm.options';

/**
 * Read by the `mikro-orm` CLI (migration:create / up / check), invoked from
 * the workspace root as `mikro-orm <cmd> --config packages/db/mikro-orm.config.ts`
 * — never `pnpm mikro-orm` from this directory, which fails because an Nx
 * package has a project.json rather than the package.json pnpm resolves
 * binaries against.
 *
 * Connection, entities and naming strategy come from `ormOptions`, shared
 * with both apps' DbModules so the running services and the migrations cannot
 * disagree about column names. Only migration concerns live here.
 */
export default defineConfig({
  ...ormOptions,

  extensions: [Migrator],

  // The workspace root is two levels up; the folder and table are declared once, in `src/migrator.ts`.
  migrations: migratorSettings(join(__dirname, '..', '..')),

  debug: true,
});
