import { Migration } from '@mikro-orm/migrations';

/**
 * The orchestration record replaces the memory-specific one. `orchestration_run`
 * is the same row for every orchestrator — the step ledger under declared ids,
 * what the orchestrator observed at open — and `orchestration_run_child` holds
 * one row per step that ran a pipeline, so any orchestrator's children fit
 * where three fixed columns fitted one.
 *
 * Every existing `memory_run` row is carried across as orchestrator `memory`
 * with its availability snapshots folded into `context` and its three child
 * columns unrolled into child rows, so nothing recorded is lost. The old table
 * is then dropped: there is no back-compatibility path, only the new shape.
 */
export class Migration20260909100001_create_orchestration_run extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "orchestration_run" (
        "id"            uuid         not null,
        "orchestrator"  varchar(80)  not null,
        "pipeline"      varchar(80)  null,
        "status"        text         not null default 'running',
        "request"       jsonb        not null,
        "context"       jsonb        not null,
        "steps"         jsonb        not null,
        "error"         jsonb        null,
        "started_at"    timestamptz  not null,
        "finished_at"   timestamptz  null,
        "created_at"    timestamptz  not null,
        "updated_at"    timestamptz  not null,
        constraint "orchestration_run_pkey" primary key ("id"),
        constraint "orchestration_run_status_check"
          check (status in ('running', 'complete', 'failed'))
      );
    `);
    this.addSql(`create index "orchestration_run_started_at_index" on "orchestration_run" ("started_at");`);
    this.addSql(`create index "orchestration_run_orchestrator_index" on "orchestration_run" ("orchestrator");`);
    this.addSql(`create index "orchestration_run_pipeline_index" on "orchestration_run" ("pipeline");`);
    this.addSql(`create index "orchestration_run_status_index" on "orchestration_run" ("status");`);

    this.addSql(`
      create table "orchestration_run_child" (
        "id"              uuid         not null,
        "run_id"          uuid         not null,
        "step"            varchar(80)  not null,
        "quality_run_id"  varchar(80)  null,
        constraint "orchestration_run_child_pkey" primary key ("id"),
        constraint "orchestration_run_child_run_id_step_unique" unique ("run_id", "step"),
        constraint "orchestration_run_child_run_id_foreign"
          foreign key ("run_id") references "orchestration_run" ("id") on delete cascade,
        constraint "orchestration_run_child_quality_run_id_foreign"
          foreign key ("quality_run_id") references "quality_run" ("id") on delete set null
      );
    `);
    this.addSql(`create index "orchestration_run_child_quality_run_id_index" on "orchestration_run_child" ("quality_run_id");`);

    // Carry every memory run across before the old table goes.
    this.addSql(`
      insert into "orchestration_run"
        ("id", "orchestrator", "pipeline", "status", "request", "context", "steps", "error",
         "started_at", "finished_at", "created_at", "updated_at")
      select "id", 'memory', "pipeline", "status", "request",
             jsonb_build_object('embedding', "embedding", 'store', "store"),
             "steps", "error", "started_at", "finished_at", "created_at", "updated_at"
      from "memory_run";
    `);
    for (const step of ['recall', 'target', 'digest']) {
      this.addSql(`
        insert into "orchestration_run_child" ("id", "run_id", "step", "quality_run_id")
        select gen_random_uuid(), "id", '${step}', "${step}_run_id"
        from "memory_run" where "${step}_run_id" is not null;
      `);
    }
    this.addSql(`drop table if exists "memory_run" cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "orchestration_run_child" cascade;`);
    this.addSql(`drop table if exists "orchestration_run" cascade;`);
  }
}
