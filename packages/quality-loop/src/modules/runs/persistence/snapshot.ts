import { IsolationLevel } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';

/**
 * Several reads as one snapshot: a read-only REPEATABLE READ transaction on a
 * fork, so every query in `read` sees the database as its first one did. A
 * header and the child rows a writer replaces wholesale then always agree —
 * all from before that write, or all from after it — never a mix of two.
 */
export const readSnapshot = <T>(
  em: EntityManager,
  read: (snapshot: EntityManager) => Promise<T>,
): Promise<T> =>
  em.fork().transactional(read, { isolationLevel: IsolationLevel.REPEATABLE_READ, readOnly: true });
