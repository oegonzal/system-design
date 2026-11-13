import { Migration } from '@mikro-orm/migrations';

/**
 * The memory tier's vector columns and HNSW indexes live in this database
 * since the pgvector move of 2026-11-12: the `vector` type they are declared
 * with comes from the pgvector extension, which has to exist before a store
 * makes its table at boot. On Aurora the master user the migrate task runs as
 * creates it; locally the compose image ships it (pgvector v0.8.0 built into
 * the Alpine Postgres), and CI's service image carries the same 0.8.0. The
 * stores' own `vec_<collection>` tables are not migrations — each is made at
 * boot by its store, outside the entity model, which is why `ormOptions`
 * skips `vec_` tables in the schema diff. `down` takes no `cascade`: with a
 * vector table standing it refuses rather than dropping the table's columns.
 */
export class Migration20261112100001_vector_extension extends Migration {
  override name = 'Migration20261112100001_vector_extension';

  override up(): void | Promise<void> {
    this.addSql('create extension if not exists vector;');
  }

  override down(): void | Promise<void> {
    this.addSql('drop extension if exists vector;');
  }
}
