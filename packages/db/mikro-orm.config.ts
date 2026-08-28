import { join } from 'path';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';

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

  migrations: {
    path: join(__dirname, 'src/migrations'),
    tableName: 'mikro_orm_migrations',
    transactional: true,
    allOrNothing: true,
    snapshot: false,
  },

  debug: true,
});
