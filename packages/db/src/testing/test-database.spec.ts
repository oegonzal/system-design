import type { EntityManager } from '@mikro-orm/postgresql';
import { afterEach, describe, expect, it } from 'vitest';

import { ensureDatabase } from './ensure-database';
import { assertTestDatabase, isTestDatabase, TEST_DATABASE_NAME } from './test-database';
import { truncateTestTables } from './truncate-test-tables';

/**
 * An entity manager that is on `database` and records every statement it is
 * sent, so a spec can prove the guard refused before anything was deleted —
 * not merely that something failed.
 */
function managerOn(database: string): { em: EntityManager; statements: string[] } {
  const statements: string[] = [];
  const connection = {
    execute: (sql: string) => {
      statements.push(sql);
      return Promise.resolve(sql.startsWith('select') ? { name: database } : []);
    },
  };
  const em = {
    fork: () => em,
    getConnection: () => connection,
    getMetadata: (entity: { name: string }) => ({ tableName: entity.name.toLowerCase() }),
  };
  return { em: em as unknown as EntityManager, statements };
}

class Prompt {}
class StarStory {}

describe('the test database guard', () => {
  it('names the test database and its lanes disposable, and nothing else', () => {
    expect(TEST_DATABASE_NAME).toBe('sysdesign_test');
    for (const name of ['sysdesign_test', 'sysdesign_test_recall', 'sysdesign_test_ci_2']) {
      expect(isTestDatabase(name), name).toBe(true);
    }
    for (const name of [
      'sysdesign',
      'postgres',
      'sysdesign_testing',
      'sysdesign_test_',
      'sysdesign_test_Lane',
      'sysdesign_test-lane',
      'prod_sysdesign_test',
      '',
    ]) {
      expect(isTestDatabase(name), name).toBe(false);
    }
  });

  it('refuses any other database with an error that names it and the way out', () => {
    expect(() => assertTestDatabase('sysdesign_test_recall', 'truncate')).not.toThrow();
    expect(() => assertTestDatabase('sysdesign', 'truncate')).toThrow(
      /Refusing to truncate database "sysdesign".*"sysdesign_test"/s,
    );
  });

  it('truncates only once the connection itself says it is on a test database', async () => {
    const refused = managerOn('sysdesign');
    await expect(truncateTestTables(refused.em, [Prompt, StarStory])).rejects.toThrow(
      /database "sysdesign"/,
    );
    // Asked which database it is on, and sent nothing after the answer.
    expect(refused.statements).toEqual(['select current_database() as name']);

    const allowed = managerOn('sysdesign_test_recall');
    await truncateTestTables(allowed.em, [Prompt, StarStory]);
    expect(allowed.statements).toEqual([
      'select current_database() as name',
      'truncate table "prompt", "starstory" cascade',
    ]);
  });

  describe('ensureDatabase', () => {
    const saved = { name: process.env['DB_NAME'], port: process.env['DB_PORT'] };
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    afterEach(() => {
      restore('DB_NAME', saved.name);
      restore('DB_PORT', saved.port);
    });

    it('refuses a database that is not a test one before it connects anywhere', async () => {
      process.env['DB_NAME'] = 'sysdesign';
      // A port nothing listens on: a guard that let this through would fail
      // with a connection error, not with the refusal asserted here.
      process.env['DB_PORT'] = '1';
      await expect(ensureDatabase()).rejects.toThrow(/Refusing to prepare database "sysdesign"/);
    });
  });
});
