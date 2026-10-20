import { Migration } from '@mikro-orm/migrations';

/**
 * One row per turn of an interview session, in ordinal order: the
 * candidate's questions and answers, and the interviewer's replies, each of
 * which is answered by one quality-loop run and claimed once by its id (the
 * unique `run_id`), with the judges' decision kept beside the text.
 */
export class Migration20261020100005_interview_turn extends Migration {
  override name = 'Migration20261020100005_interview_turn';

  override up(): void | Promise<void> {
    this.addSql(`
      create table "interview_turn" (
        "id"                      uuid         not null,
        "session_id"              uuid         not null,
        "ordinal"                 int          not null,
        "phase"                   text         not null,
        "role"                    text         not null,
        "text"                    text         not null default '',
        "disclosed_criterion_ids" jsonb        not null,
        "run_id"                  varchar(80)  null,
        "decision"                text         null,
        "overall"                 double precision null,
        "claimed_at"              timestamptz  null,
        "created_at"              timestamptz  not null,
        constraint "interview_turn_pkey" primary key ("id"),
        constraint "interview_turn_role_check" check (role in ('interviewer', 'candidate'))
      );
    `);
    this.addSql(`create index "interview_turn_session_id_index" on "interview_turn" ("session_id");`);
    this.addSql(
      `alter table "interview_turn" add constraint "interview_turn_session_id_ordinal_unique" unique ("session_id", "ordinal");`,
    );
    this.addSql(
      `alter table "interview_turn" add constraint "interview_turn_run_id_unique" unique ("run_id");`,
    );
    this.addSql(`
      alter table "interview_turn"
        add constraint "interview_turn_session_id_foreign"
        foreign key ("session_id") references "design_session" ("id")
        on delete cascade;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "interview_turn" cascade;`);
  }
}
