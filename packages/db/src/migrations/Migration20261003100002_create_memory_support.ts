import { Migration } from '@mikro-orm/migrations';

/**
 * Which run's evidence confirmed or contradicted which stored knowledge item.
 * One row per point per source run — the unique constraint is what makes
 * reinforcement idempotent: a run digested again replaces its own rows rather
 * than counting twice, which a counter on the vector point could not do.
 *
 * `content_hash` is the point's text as the claim was made against it, so a
 * point re-digested into different words keeps its id and loses this support
 * exactly. The count a search reads lives on the vector store's payload and is
 * recomputed from these rows; nothing here is on a read path.
 *
 * A claim dies with the run that made it (cascade). A digest run removed later
 * leaves the claim standing (set null): the claim was the source run's.
 */
export class Migration20261003100002_create_memory_support extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "memory_support" (
        "id"             uuid         not null,
        "point_id"       uuid         not null,
        "target_run_id"  varchar(80)  not null,
        "target_ref"     varchar(200) not null,
        "content_hash"   varchar(64)  not null,
        "source_run_id"  varchar(80)  not null,
        "digest_run_id"  varchar(80)  null,
        "kind"           text         not null,
        "created_at"     timestamptz  not null,
        constraint "memory_support_pkey" primary key ("id"),
        constraint "memory_support_kind_check" check (kind in ('confirms', 'contradicts'))
      );
    `);
    this.addSql(
      `alter table "memory_support" add constraint "memory_support_point_id_source_run_id_unique" unique ("point_id", "source_run_id");`,
    );
    this.addSql(
      `create index "memory_support_target_run_id_index" on "memory_support" ("target_run_id");`,
    );
    this.addSql(
      `create index "memory_support_source_run_id_index" on "memory_support" ("source_run_id");`,
    );
    this.addSql(
      `alter table "memory_support" add constraint "memory_support_source_run_id_foreign" foreign key ("source_run_id") references "quality_run" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "memory_support" add constraint "memory_support_digest_run_id_foreign" foreign key ("digest_run_id") references "quality_run" ("id") on delete set null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "memory_support" cascade;`);
  }
}
