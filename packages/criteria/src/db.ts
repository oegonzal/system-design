import type { Criterion } from './criterion';

/** The shared database (packages/db): the entities and migrations every service shares, and the raw SQL the memory tier runs beside them. */
export const DB_CRITERIA: readonly Criterion[] = [
  {
    id: 'DB-1',
    statement:
      'Raw SQL runs through one executor over the ORM’s connection: a `?` placeholder binds a string, a Postgres array literal, JSON and a vector; a statement reports the rows it affected; a driver error keeps its Postgres code; and a transaction commits what its callback did, leaves no row when the callback throws, runs a nested call on its own connection so the call sees the uncommitted row, and holds a transaction opened inside it as a savepoint.',
  },
  {
    id: 'DB-2',
    statement:
      'The vector extension exists by migration, and a table a memory store makes at boot is not drift: the schema check behind `migration:check` skips every `vec_` table, so it passes with one standing and proposes dropping it only when the skip is removed.',
  },
];
