/**
 * Where the database is, and the one place its defaults are declared.
 *
 * Every connection reads it: `ormOptions` (the apps' DbModules and the
 * migration CLI), `ensureDatabase` (the integration harnesses) and the e2e
 * suite's global setup. The defaults are the compose Postgres that both local
 * launchers share (`pnpm stack:up` and `tilt up`), so nothing on this machine
 * sets `DB_PORT`; CI sets it to its service's 5432, and a pod sets `DB_HOST`.
 *
 * It has its own entry point, `@sysdesign/db/connection`, because the e2e
 * global setup runs under Playwright's transform, which cannot load the legacy
 * decorators the package index brings in with the entities.
 */
export function connectionSettings(env: NodeJS.ProcessEnv) {
  return {
    host: env['DB_HOST'] ?? 'localhost',
    port: parseInt(env['DB_PORT'] ?? '5433', 10),
    user: env['DB_USERNAME'] ?? 'admin',
    password: env['DB_PASSWORD'] ?? 'admin',
    dbName: env['DB_NAME'] ?? 'sysdesign',
  };
}
