import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { EntityManager } from '@mikro-orm/postgresql';
import { afterEach, describe, expect, it } from 'vitest';

import { assertMigrated, MIGRATIONS_DIR, migratorSettings, MigrationsPending } from './migrator';

const FIRST = 'Migration20260101100001_first';
const SECOND = 'Migration20260102100001_second';

/** A workspace whose migrations folder holds `files`. */
function workspaceWith(...files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'sysdesign-migrator-'));
  const dir = join(root, MIGRATIONS_DIR);
  mkdirSync(dir, { recursive: true });
  for (const file of files) writeFileSync(join(dir, file), '');
  roots.push(root);
  return root;
}
const roots: string[] = [];

/**
 * An entity manager on `database` whose migrator has recorded `applied` — or,
 * with `applied: null`, whose migrator never ran — recording every statement
 * it is sent.
 */
function managerOn(
  database: string,
  applied: readonly string[] | null,
): { em: EntityManager; statements: string[] } {
  const statements: string[] = [];
  const connection = {
    execute: (sql: string) => {
      statements.push(sql);
      return Promise.resolve(
        sql.includes('current_database()')
          ? { name: database, recorded: applied !== null }
          : (applied ?? []).map((name) => ({ name })),
      );
    },
  };
  const em = { fork: () => em, getConnection: () => connection };
  return { em: em as unknown as EntityManager, statements };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('assertMigrated', () => {
  it('lets a database that applied every migration in the folder through', async () => {
    const root = workspaceWith(`${FIRST}.ts`, `${SECOND}.ts`);
    await expect(
      assertMigrated(managerOn('db', [FIRST, SECOND]).em, root),
    ).resolves.toBeUndefined();
  });

  it('refuses a database behind the folder, naming the database, each migration it lacks, and the command that applies them', async () => {
    const root = workspaceWith(`${FIRST}.ts`, `${SECOND}.ts`);
    const refused = assertMigrated(managerOn('sysdesign', [FIRST]).em, root);
    await expect(refused).rejects.toBeInstanceOf(MigrationsPending);
    await expect(refused).rejects.toMatchObject({ database: 'sysdesign', pending: [SECOND] });
    await expect(refused).rejects.toThrow(
      `database sysdesign has not applied 1 migration(s) this checkout carries: ${SECOND} — run \`DB_NAME=sysdesign pnpm db:migrate\``,
    );
  });

  it('reads a database the migrator never touched as having applied none, without asking for its table', async () => {
    const root = workspaceWith(`${FIRST}.ts`, `${SECOND}.ts`);
    const { em, statements } = managerOn('fresh', null);
    await expect(assertMigrated(em, root)).rejects.toMatchObject({ pending: [FIRST, SECOND] });
    expect(statements).toHaveLength(1);
  });

  it('counts what the migrator counts: a script by the name it records, never a type declaration', async () => {
    const root = workspaceWith(`${FIRST}.ts`, 'shapes.d.ts', `${SECOND}.js`);
    await expect(assertMigrated(managerOn('db', []).em, root)).rejects.toMatchObject({
      pending: [FIRST, SECOND],
    });
    // A migration recorded but no longer in the folder is the database's history, not a gap.
    await expect(
      assertMigrated(managerOn('db', [FIRST, SECOND, 'Migration20250101100001_gone']).em, root),
    ).resolves.toBeUndefined();
  });
});

describe('migratorSettings', () => {
  it('points the migrator at the one migrations folder, from any workspace root', () => {
    expect(migratorSettings('/w')).toMatchObject({
      path: join('/w', MIGRATIONS_DIR),
      tableName: 'mikro_orm_migrations',
    });
  });
});
