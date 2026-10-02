import type { EntityName } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';

import { assertTestDatabase } from './test-database';

/**
 * The one way a test empties tables. It asks the connection which database
 * it is actually on — not the environment, which is only what someone meant
 * to connect to — and refuses unless that is a test database; then it
 * truncates every entity's table in one statement, cascading to whatever
 * references them. Tables are named by entity, so a renamed table cannot
 * leave a stale string behind.
 */
export async function truncateTestTables(
  em: EntityManager,
  entities: readonly EntityName<object>[],
): Promise<void> {
  const connection = em.fork().getConnection();
  const { name } = await connection.execute<{ name: string }>(
    'select current_database() as name',
    [],
    'get',
  );
  assertTestDatabase(name, 'truncate tables in');
  const tables = entities.map((entity) => `"${em.getMetadata(entity).tableName}"`);
  await connection.execute(`truncate table ${tables.join(', ')} cascade`);
}
