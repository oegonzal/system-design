import { Migration } from '@mikro-orm/migrations';

/**
 * A coaching run, keyed by the loop's run id, remembers its session, the
 * revision it started from and its budget — so the workspace can find the
 * newest run after a reload, and an adopting run (which stores no revision
 * of its own at iteration 1) can still be resolved from its session.
 */
export class Migration20260929400001_create_coaching_run extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "coaching_run" (
        "run_id"           varchar(80) not null,
        "session_id"       uuid        not null,
        "base_revision_id" uuid        not null,
        "max_iterations"   int         not null,
        "started_at"       timestamptz not null,
        constraint "coaching_run_pkey" primary key ("run_id")
      );
    `);
    this.addSql(`create index "coaching_run_session_id_index" on "coaching_run" ("session_id");`);
    this.addSql(`
      alter table "coaching_run"
        add constraint "coaching_run_session_id_foreign"
        foreign key ("session_id") references "design_session" ("id")
        on delete cascade;
    `);
    this.addSql(`
      alter table "coaching_run"
        add constraint "coaching_run_base_revision_id_foreign"
        foreign key ("base_revision_id") references "design_revision" ("id")
        on delete cascade;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "coaching_run" cascade;`);
  }
}
