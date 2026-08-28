import { Migration } from '@mikro-orm/migrations';

/** 3 of 8 — one attempt at one prompt. */
export class Migration20260827100003_create_design_session extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "design_session" (
        "id"         uuid        not null,
        "prompt_id"  uuid        not null,
        "status"     text        not null default 'in-progress',
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "design_session_pkey" primary key ("id"),
        constraint "design_session_status_check" check ("status" in ('in-progress', 'completed', 'abandoned'))
      );
    `);

    this.addSql(`
      create index "design_session_prompt_id_index" on "design_session" ("prompt_id");
    `);

    // restrict: a prompt with sessions is history worth keeping — archive it instead.
    this.addSql(`
      alter table "design_session"
        add constraint "design_session_prompt_id_foreign"
        foreign key ("prompt_id") references "prompt" ("id")
        on delete restrict;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "design_session" cascade;`);
  }
}
