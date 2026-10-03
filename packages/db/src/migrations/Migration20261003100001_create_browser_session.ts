import { Migration } from '@mikro-orm/migrations';

/**
 * A browser session's ledger: `browser_session` is the header (the goal as
 * run, the profile and mode, the declared rails, how it ended, a heartbeat),
 * `browser_task` one row per unit of work the mission opened and closed, and
 * `browser_decision` one row per decision acted on — a page's plan, a field's
 * answer, the termination — each naming the quality-loop run or orchestration
 * that took it. The loop ids are plain varchar(80), not foreign keys: the loop
 * is another service that shares this database and sweeps its own rows.
 *
 * Decisions are keyed by step and ordinal within a session, so a replay reads
 * them in the order they were taken; `question` (a field's label) is indexed
 * because it is the join key for "was this asked before, and later answered
 * from memory". A task's decisions survive the task (set null); nothing
 * survives the session (cascade).
 */
export class Migration20261003100001_create_browser_session extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "browser_session" (
        "id"                 uuid        not null,
        "dump_run_id"        varchar(80) not null,
        "goal_path"          text        not null,
        "goal_hash"          varchar(64) not null,
        "goal_markdown"      text        not null,
        "profile"            text        not null,
        "headed"             boolean     not null,
        "status"             text        not null default 'running',
        "termination_reason" text        null,
        "termination_detail" text        null,
        "limits"             jsonb       not null,
        "criteria"           jsonb       null,
        "steps"              int         not null default 0,
        "started_at"         timestamptz not null,
        "heartbeat_at"       timestamptz not null,
        "finished_at"        timestamptz null,
        "error"              jsonb       null,
        constraint "browser_session_pkey" primary key ("id"),
        constraint "browser_session_dump_run_id_unique" unique ("dump_run_id"),
        constraint "browser_session_status_check"
          check (status in ('running', 'complete', 'stopped', 'failed')),
        constraint "browser_session_termination_reason_check"
          check (termination_reason is null or termination_reason in ('mission-complete', 'limit-reached', 'login-wall', 'blocked', 'max-tasks', 'max-minutes', 'max-failures', 'brain-unavailable', 'operator-stop', 'error'))
      );
    `);
    this.addSql(`create index "browser_session_goal_hash_index" on "browser_session" ("goal_hash");`);
    this.addSql(`create index "browser_session_status_index" on "browser_session" ("status");`);
    this.addSql(`create index "browser_session_started_at_index" on "browser_session" ("started_at");`);

    this.addSql(`
      create table "browser_task" (
        "id"           uuid        not null,
        "session_id"   uuid        not null,
        "ordinal"      int         not null,
        "label"        text        not null,
        "external_ref" text        null,
        "status"       text        not null default 'open',
        "outcome"      text        null,
        "start_step"   int         not null,
        "end_step"     int         null,
        "started_at"   timestamptz not null,
        "finished_at"  timestamptz null,
        constraint "browser_task_pkey" primary key ("id"),
        constraint "browser_task_status_check"
          check (status in ('open', 'complete', 'abandoned', 'failed')),
        constraint "browser_task_outcome_check"
          check (outcome is null or outcome in ('done', 'already-done', 'skipped', 'failed'))
      );
    `);
    this.addSql(`create index "browser_task_session_id_index" on "browser_task" ("session_id");`);
    this.addSql(`create index "browser_task_external_ref_index" on "browser_task" ("external_ref");`);
    this.addSql(`
      alter table "browser_task"
        add constraint "browser_task_session_id_ordinal_unique" unique ("session_id", "ordinal");
    `);
    this.addSql(`
      alter table "browser_task"
        add constraint "browser_task_session_id_foreign"
        foreign key ("session_id") references "browser_session" ("id")
        on delete cascade;
    `);

    this.addSql(`
      create table "browser_decision" (
        "id"                     uuid        not null,
        "session_id"             uuid        not null,
        "task_id"                uuid        null,
        "step"                   int         not null,
        "ordinal"                int         not null,
        "kind"                   text        not null,
        "source"                 text        not null,
        "loop_run_id"            varchar(80) null,
        "loop_orchestration_id"  varchar(80) null,
        "teach_orchestration_id" varchar(80) null,
        "ref"                    text        null,
        "question"               text        null,
        "answer"                 text        null,
        "confidence"             text        null,
        "payload"                jsonb       not null,
        "duration_ms"            int         null,
        "created_at"             timestamptz not null,
        constraint "browser_decision_pkey" primary key ("id"),
        constraint "browser_decision_kind_check"
          check (kind in ('step-plan', 'field-answer', 'termination')),
        constraint "browser_decision_source_check"
          check (source in ('loop', 'memory', 'operator', 'blank', 'engine')),
        constraint "browser_decision_confidence_check"
          check (confidence is null or confidence in ('high', 'medium', 'low'))
      );
    `);
    this.addSql(`create index "browser_decision_session_id_index" on "browser_decision" ("session_id");`);
    this.addSql(`create index "browser_decision_loop_run_id_index" on "browser_decision" ("loop_run_id");`);
    this.addSql(`create index "browser_decision_question_index" on "browser_decision" ("question");`);
    this.addSql(`
      alter table "browser_decision"
        add constraint "browser_decision_session_id_step_ordinal_unique" unique ("session_id", "step", "ordinal");
    `);
    this.addSql(`
      alter table "browser_decision"
        add constraint "browser_decision_session_id_foreign"
        foreign key ("session_id") references "browser_session" ("id")
        on delete cascade;
    `);
    this.addSql(`
      alter table "browser_decision"
        add constraint "browser_decision_task_id_foreign"
        foreign key ("task_id") references "browser_task" ("id")
        on delete set null;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "browser_decision" cascade;`);
    this.addSql(`drop table if exists "browser_task" cascade;`);
    this.addSql(`drop table if exists "browser_session" cascade;`);
  }
}
