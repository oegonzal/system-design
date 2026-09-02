import { Migration } from '@mikro-orm/migrations';

/**
 * The AI coach: a background improvement run over one session's design.
 *
 * `design_revision.origin` records who authored a snapshot — the practising
 * user or the coach — so a machine-made grade is never mistaken for the
 * author's own. Existing rows are all user-authored, which is exactly the
 * column default.
 *
 * `improvement_run` is the work-queue row (claimed like `eval_job`, with the
 * same reaper discipline) plus the run's live trajectory. The partial unique
 * index enforces "one active run per session" — the service's 409 is only the
 * friendly message in front of it.
 */
export class Migration20260902100001_create_improvement_run extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "design_revision" add column "origin" text not null default 'user';
    `);
    this.addSql(`
      alter table "design_revision" add constraint "design_revision_origin_check"
        check (origin in ('user', 'assistant'));
    `);

    this.addSql(`
      create table "improvement_run" (
        "id" uuid not null,
        "session_id" uuid not null,
        "base_revision_id" uuid not null,
        "best_revision_id" uuid null,
        "status" text not null default 'queued',
        "max_iterations" int not null,
        "iterations" jsonb not null,
        "stopped_reason" text null,
        "error" text null,
        "attempts" int not null default 0,
        "max_attempts" int not null default 3,
        "locked_at" timestamptz null,
        "locked_by" varchar(60) null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "improvement_run_pkey" primary key ("id"),
        constraint "improvement_run_status_check"
          check (status in ('queued', 'running', 'completed', 'failed', 'cancelled'))
      );
    `);
    this.addSql(`
      alter table "improvement_run"
        add constraint "improvement_run_session_id_foreign"
        foreign key ("session_id") references "design_session" ("id")
        on delete cascade;
    `);
    this.addSql(`
      alter table "improvement_run"
        add constraint "improvement_run_base_revision_id_foreign"
        foreign key ("base_revision_id") references "design_revision" ("id")
        on delete cascade;
    `);
    this.addSql(`
      alter table "improvement_run"
        add constraint "improvement_run_best_revision_id_foreign"
        foreign key ("best_revision_id") references "design_revision" ("id")
        on delete set null;
    `);
    this.addSql(`
      create index "improvement_run_status_index" on "improvement_run" ("status");
    `);
    this.addSql(`
      create unique index "improvement_run_one_active_per_session"
        on "improvement_run" ("session_id") where status in ('queued', 'running');
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "improvement_run" cascade;`);
    this.addSql(`
      alter table "design_revision" drop constraint if exists "design_revision_origin_check";
    `);
    this.addSql(`alter table "design_revision" drop column if exists "origin";`);
  }
}
