import { Migration } from '@mikro-orm/migrations';

/**
 * 7 of 8 — the Postgres-backed work queue. The composite (status, run_after)
 * index is the poll query's whole cost model:
 *
 *   select … where status = 'queued' and run_after <= now()
 *   order by created_at limit 1 for update skip locked
 */
export class Migration20260827100007_create_eval_job extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "eval_job" (
        "id"           uuid        not null,
        "revision_id"  uuid        not null,
        "status"       text        not null default 'queued',
        "attempts"     int         not null default 0,
        "max_attempts" int         not null default 3,
        "run_after"    timestamptz not null,
        "locked_at"    timestamptz null,
        "locked_by"    varchar(60) null,
        "last_error"   text        null,
        "created_at"   timestamptz not null,
        "updated_at"   timestamptz not null,
        constraint "eval_job_pkey" primary key ("id"),
        constraint "eval_job_status_check" check ("status" in ('queued', 'running', 'completed', 'failed'))
      );
    `);

    this.addSql(`
      create index "eval_job_status_run_after_index" on "eval_job" ("status", "run_after");
    `);

    // One job per revision: a retry resets the row, never inserts a sibling.
    this.addSql(`
      alter table "eval_job"
        add constraint "eval_job_revision_id_unique" unique ("revision_id");
    `);

    this.addSql(`
      alter table "eval_job"
        add constraint "eval_job_revision_id_foreign"
        foreign key ("revision_id") references "design_revision" ("id")
        on delete cascade;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "eval_job" cascade;`);
  }
}
