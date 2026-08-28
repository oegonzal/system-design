import { Migration } from '@mikro-orm/migrations';

/**
 * 5 of 8 — the graded result, exactly one per revision (unique FK). Retries
 * update this row in place rather than inserting a sibling.
 */
export class Migration20260827100005_create_evaluation extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "evaluation" (
        "id"               uuid             not null,
        "revision_id"      uuid             not null,
        "status"           text             not null default 'queued',
        "overall_score"    double precision null,
        "grade"            text             null,
        "dimension_scores" jsonb            null,
        "summary"          text             null,
        "engine_version"   varchar(20)      null,
        "critic_model"     varchar(60)      null,
        "error"            text             null,
        "started_at"       timestamptz      null,
        "completed_at"     timestamptz      null,
        "created_at"       timestamptz      not null,
        "updated_at"       timestamptz      not null,
        constraint "evaluation_pkey" primary key ("id"),
        constraint "evaluation_status_check" check ("status" in ('queued', 'running', 'complete', 'failed')),
        constraint "evaluation_grade_check" check ("grade" is null or "grade" in ('A', 'B', 'C', 'D', 'F'))
      );
    `);

    this.addSql(`
      alter table "evaluation"
        add constraint "evaluation_revision_id_unique" unique ("revision_id");
    `);

    this.addSql(`
      alter table "evaluation"
        add constraint "evaluation_revision_id_foreign"
        foreign key ("revision_id") references "design_revision" ("id")
        on delete cascade;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "evaluation" cascade;`);
  }
}
