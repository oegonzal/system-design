import { Migration } from '@mikro-orm/migrations';

/**
 * The memory layer's two tables in the run database. `memory_run` is the
 * orchestration record over three quality runs (nullable references, so a
 * deleted child never takes the record with it); `memory_embedding` is the
 * embedding cache keyed by (model, text hash). Vectors that are searched live
 * in the vector store, not here.
 */
export class Migration20260907100001_create_memory_run extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "memory_run" (
        "id"             uuid         not null,
        "pipeline"       varchar(80)  not null,
        "status"         text         not null default 'running',
        "request"        jsonb        not null,
        "embedding"      jsonb        not null,
        "store"          jsonb        not null,
        "steps"          jsonb        not null,
        "recall_run_id"  varchar(80)  null,
        "target_run_id"  varchar(80)  null,
        "digest_run_id"  varchar(80)  null,
        "error"          jsonb        null,
        "started_at"     timestamptz  not null,
        "finished_at"    timestamptz  null,
        "created_at"     timestamptz  not null,
        "updated_at"     timestamptz  not null,
        constraint "memory_run_pkey" primary key ("id"),
        constraint "memory_run_status_check"
          check (status in ('running', 'complete', 'failed'))
      );
    `);
    this.addSql(`create index "memory_run_started_at_index" on "memory_run" ("started_at");`);
    this.addSql(`create index "memory_run_pipeline_index" on "memory_run" ("pipeline");`);
    this.addSql(`create index "memory_run_status_index" on "memory_run" ("status");`);
    this.addSql(`create index "memory_run_recall_run_id_index" on "memory_run" ("recall_run_id");`);
    this.addSql(`create index "memory_run_target_run_id_index" on "memory_run" ("target_run_id");`);
    this.addSql(`create index "memory_run_digest_run_id_index" on "memory_run" ("digest_run_id");`);
    for (const child of ['recall', 'target', 'digest']) {
      this.addSql(`
        alter table "memory_run"
          add constraint "memory_run_${child}_run_id_foreign"
          foreign key ("${child}_run_id") references "quality_run" ("id")
          on delete set null;
      `);
    }

    this.addSql(`
      create table "memory_embedding" (
        "id"            uuid         not null,
        "model"         varchar(80)  not null,
        "content_hash"  varchar(64)  not null,
        "embedding"     jsonb        not null,
        "created_at"    timestamptz  not null,
        constraint "memory_embedding_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "memory_embedding"
        add constraint "memory_embedding_model_content_hash_unique" unique ("model", "content_hash");
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "memory_embedding" cascade;`);
    this.addSql(`drop table if exists "memory_run" cascade;`);
  }
}
