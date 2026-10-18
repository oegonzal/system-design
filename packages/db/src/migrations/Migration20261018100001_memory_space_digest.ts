import { Migration } from '@mikro-orm/migrations';

/**
 * The apply ledger of a memory space's digests: one row per digest remembered
 * into a space, keyed by the loop orchestration it was read from — a plain
 * column, never a foreign key, since the loop is another service — and gone
 * with its space. The row is written once, after the writes, so a second apply
 * of the same digest loses on the primary key. The index on the space serves
 * the cascade: deleting a space finds its applies without scanning the table.
 */
export class Migration20261018100001_memory_space_digest extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "memory_space_digest" (
        "orchestration_run_id"  uuid         not null,
        "space_id"              uuid         not null,
        "digest_run_id"         varchar(80)      null,
        "items"                 jsonb        not null,
        "applied_at"            timestamptz  not null,
        constraint "memory_space_digest_pkey" primary key ("orchestration_run_id")
      );
    `);
    this.addSql(
      `alter table "memory_space_digest" add constraint "memory_space_digest_space_id_foreign" foreign key ("space_id") references "memory_space" ("id") on delete cascade;`,
    );
    this.addSql(
      `create index "memory_space_digest_space_id_index" on "memory_space_digest" ("space_id");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "memory_space_digest" cascade;`);
  }
}
