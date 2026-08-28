import { Migration } from '@mikro-orm/migrations';

/**
 * 4 of 8 — immutable canvas snapshots. unique (session_id, revision_number)
 * is what makes "revision N of session S" a stable address for evaluations
 * and the UI's timeline.
 */
export class Migration20260827100004_create_design_revision extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "design_revision" (
        "id"              uuid        not null,
        "session_id"      uuid        not null,
        "revision_number" int         not null,
        "graph"           jsonb       not null,
        "notes"           text        null,
        "created_at"      timestamptz not null,
        constraint "design_revision_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create index "design_revision_session_id_index" on "design_revision" ("session_id");
    `);

    this.addSql(`
      alter table "design_revision"
        add constraint "design_revision_session_id_revision_number_unique"
        unique ("session_id", "revision_number");
    `);

    // cascade: a deleted session's snapshots are meaningless on their own.
    this.addSql(`
      alter table "design_revision"
        add constraint "design_revision_session_id_foreign"
        foreign key ("session_id") references "design_session" ("id")
        on delete cascade;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "design_revision" cascade;`);
  }
}
