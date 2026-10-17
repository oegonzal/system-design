import { Migration } from '@mikro-orm/migrations';

/**
 * The agentic-memory runtime's store: a space per executed strategy, and the
 * memory records it keeps. A record is never deleted — the lifecycle check
 * holds that only an active row is open (no close time, no valid-time end), and
 * the partial unique indexes that only one active row stands per identity and
 * exact scope, or per content and exact scope for a kind that appends. The GIN indexes serve the array and jsonb containment a recall
 * and a consolidation filter on; the partial expiry index serves the sweep.
 */
export class Migration20261017100002_memory_space_and_record extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "memory_space" (
        "id"             uuid         not null,
        "design_run_id"  varchar(80)  not null,
        "strategy"       jsonb        not null,
        "policy"         jsonb        not null,
        "policy_source"  text         not null,
        "created_at"     timestamptz  not null,
        constraint "memory_space_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      create table "memory_record" (
        "id"              uuid         not null,
        "space_id"        uuid         not null,
        "register"        text         not null,
        "kind"            varchar(20)  not null,
        "partition"       text         not null,
        "scope"           jsonb        not null,
        "identity"        text             null,
        "keys"            text[]       not null,
        "body"            jsonb        not null,
        "metadata"        jsonb        not null,
        "text"            text         not null,
        "content_hash"    varchar(64)  not null,
        "status"          varchar(20)  not null,
        "version"         int          not null,
        "supersedes_id"   uuid             null,
        "lineage_id"      uuid         not null,
        "valid_from"      timestamptz  not null,
        "valid_to"        timestamptz      null,
        "recorded_at"     timestamptz  not null,
        "expires_at"      timestamptz      null,
        "closed_at"       timestamptz      null,
        "close_reason"    text             null,
        "support"         int          not null,
        "provenance"      jsonb        not null,
        "projected_into"  text             null,
        constraint "memory_record_pkey" primary key ("id"),
        constraint "memory_record_kind_check"
          check (kind in ('working', 'episodic', 'semantic', 'procedural', 'relational')),
        constraint "memory_record_status_check"
          check (status in ('active', 'superseded', 'invalidated', 'expired')),
        constraint "memory_record_lifecycle_check"
          check ((status = 'active') = (closed_at is null) and (status = 'active') = (valid_to is null)),
        constraint "memory_record_counts_check" check (version >= 1 and support >= 1)
      );
    `);
    this.addSql(
      `alter table "memory_record" add constraint "memory_record_space_id_foreign" foreign key ("space_id") references "memory_space" ("id") on delete cascade;`,
    );
    this.addSql(
      `create index "memory_record_visible_index" on "memory_record" ("space_id", "partition", "register", "status");`,
    );
    this.addSql(
      `create index "memory_record_valid_from_index" on "memory_record" ("space_id", "register", "valid_from");`,
    );
    this.addSql(
      `create index "memory_record_content_hash_index" on "memory_record" ("space_id", "register", "content_hash");`,
    );
    this.addSql(`create index "memory_record_lineage_id_index" on "memory_record" ("lineage_id");`);
    this.addSql(
      `create index "memory_record_keys_gin_index" on "memory_record" using gin ("keys");`,
    );
    this.addSql(
      `create index "memory_record_scope_gin_index" on "memory_record" using gin ("scope" jsonb_path_ops);`,
    );
    this.addSql(
      `create index "memory_record_metadata_gin_index" on "memory_record" using gin ("metadata" jsonb_path_ops);`,
    );
    this.addSql(
      `create index "memory_record_expiry_index" on "memory_record" ("expires_at") where "status" = 'active' and "expires_at" is not null;`,
    );
    this.addSql(
      `create unique index "memory_record_current_identity_unique" on "memory_record" ("space_id", "register", "scope", "identity") where "status" = 'active' and "identity" is not null;`,
    );
    this.addSql(
      `create unique index "memory_record_current_content_unique" on "memory_record" ("space_id", "register", "scope", "content_hash") where "status" = 'active' and "identity" is null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "memory_record" cascade;`);
    this.addSql(`drop table if exists "memory_space" cascade;`);
  }
}
