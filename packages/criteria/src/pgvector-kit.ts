import type { Criterion } from './criterion';

/** The pgvector kit (packages/pgvector-kit): what every store over pgvector names, writes and makes sure of the same way. */
export const PGVECTOR_KIT_CRITERIA: readonly Criterion[] = [
  {
    id: 'PGV-1',
    statement:
      'A collection is named by its store, the generation of what it embeds, the embedding model made safe for a name and its width, and lives in a table named `vec_` plus that name lower-cased with every character outside [a-z0-9_] replaced; a name past PostgreSQL’s 63-byte identifier limit keeps its first 50 characters and takes 12 hex characters of the collection’s sha256, the same every time and different for a different collection.',
  },
  {
    id: 'PGV-2',
    statement:
      'A vector is written as the literal pgvector reads, `[0.1,0.2,…]`, to be bound as `?::vector`, an empty vector or a non-finite element refused naming its index; a list of texts is written as a PostgreSQL array literal with every value quoted and its quotes and backslashes escaped, `{}` for none, to be bound as `?::text[]` — so generated SQL carries no literal `?` of its own.',
  },
  {
    id: 'PGV-3',
    statement:
      'A collection’s schema is made sure of at boot: a database without the vector extension is refused by name, naming the migration command, before any statement runs; otherwise every declared statement runs in order, and when another process won a create at the same moment (SQLSTATE 23505 or 42P07, read from the error or its cause) the list runs once more from the start instead of failing, while any other failure, and a create lost twice, is the caller’s to see.',
  },
  {
    id: 'PGV-4',
    statement:
      'The spec support every adapter spec runs against holds without a database: the executor fake records each statement with the values bound to it, answers from the script the spec hands in — the rows, the first row, or their count as rows affected — and marks a transaction’s begin, commit and rollback around its callback, so a spec can read what ran inside one and that a throw rolled it back; the vector math maps a text to one unit vector and scores cosine as 1 - (a <=> b) does.',
  },
];
