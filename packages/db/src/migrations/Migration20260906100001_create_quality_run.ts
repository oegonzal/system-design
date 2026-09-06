import { Migration } from '@mikro-orm/migrations';

/**
 * The quality loop's runs, normalised. `quality_run` is the run header and
 * the live exchange log; `quality_run_criterion` the derived contract;
 * `quality_run_iteration` one row per loop turn with the ledger's scalar and
 * record parts; `quality_run_finding` and `quality_run_criterion_result` the
 * ledger's two lists, each with a denormalised `run_id` for cross-run SQL.
 * The wire trace is reassembled exactly from these rows (position and
 * iteration order), so a restart loses nothing but in-flight runs — which the
 * service's boot sweep marks failed.
 *
 * The primary key of `quality_run` is the run-dump id string, not a uuid: it
 * already names the dump folder and the URL.
 */
export class Migration20260906100001_create_quality_run extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "quality_run" (
        "id"               varchar(80)      not null,
        "pipeline"         varchar(80)      not null,
        "pipeline_version" varchar(40)      null,
        "status"           text             not null default 'running',
        "final_decision"   text             null,
        "stop_reason"      text             null,
        "overall"          double precision null,
        "best_iteration"   int              null,
        "exchange_count"   int              not null default 0,
        "llm"              jsonb            not null,
        "request"          jsonb            not null,
        "git"              jsonb            not null,
        "exchanges"        jsonb            not null,
        "lessons"          jsonb            null,
        "error"            jsonb            null,
        "started_at"       timestamptz      not null,
        "finished_at"      timestamptz      null,
        "created_at"       timestamptz      not null,
        "updated_at"       timestamptz      not null,
        constraint "quality_run_pkey" primary key ("id"),
        constraint "quality_run_status_check"
          check (status in ('running', 'complete', 'failed')),
        constraint "quality_run_final_decision_check"
          check (final_decision is null or final_decision in ('accept', 'revise', 'retry', 'escalate', 'reject')),
        constraint "quality_run_stop_reason_check"
          check (stop_reason is null or stop_reason in ('accepted', 'rejected', 'escalated', 'plateau', 'max-iterations', 'producer-unavailable'))
      );
    `);
    this.addSql(`create index "quality_run_started_at_index" on "quality_run" ("started_at");`);
    this.addSql(`create index "quality_run_pipeline_index" on "quality_run" ("pipeline");`);
    this.addSql(`create index "quality_run_status_index" on "quality_run" ("status");`);

    this.addSql(`
      create table "quality_run_criterion" (
        "id"           uuid        not null,
        "run_id"       varchar(80) not null,
        "position"     int         not null,
        "criterion_id" varchar(20) not null,
        "kind"         varchar(60) not null,
        "statement"    text        not null,
        constraint "quality_run_criterion_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "quality_run_criterion"
        add constraint "quality_run_criterion_run_id_criterion_id_unique" unique ("run_id", "criterion_id");
    `);
    this.addSql(`
      alter table "quality_run_criterion"
        add constraint "quality_run_criterion_run_id_foreign"
        foreign key ("run_id") references "quality_run" ("id")
        on delete cascade;
    `);

    this.addSql(`
      create table "quality_run_iteration" (
        "id"               uuid        not null,
        "run_id"           varchar(80) not null,
        "iteration"        int         not null,
        "mode"             text        not null,
        "artifact"         jsonb       null,
        "rendered"         text        null,
        "locations"        jsonb       not null,
        "validation"       jsonb       not null,
        "critics"          jsonb       not null,
        "evaluators"       jsonb       not null,
        "artifact_present" boolean     not null,
        "discarded"        jsonb       not null,
        "diagnostics"      jsonb       not null,
        "decision"         jsonb       not null,
        "remediations"     jsonb       not null,
        "duration_ms"      int         not null,
        constraint "quality_run_iteration_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "quality_run_iteration"
        add constraint "quality_run_iteration_run_id_iteration_unique" unique ("run_id", "iteration");
    `);
    this.addSql(`
      alter table "quality_run_iteration"
        add constraint "quality_run_iteration_run_id_foreign"
        foreign key ("run_id") references "quality_run" ("id")
        on delete cascade;
    `);

    this.addSql(`
      create table "quality_run_finding" (
        "id"            uuid        not null,
        "iteration_id"  uuid        not null,
        "run_id"        varchar(80) not null,
        "position"      int         not null,
        "key"           text        not null,
        "type"          varchar(60) not null,
        "severity"      text        not null,
        "confidence"    text        not null,
        "fixability"    text        not null,
        "location_refs" text[]      not null,
        "criterion_ids" text[]      not null,
        "hits"          int         not null,
        "lenses"        text[]      not null,
        "reconciled_to" varchar(20) null,
        constraint "quality_run_finding_pkey" primary key ("id"),
        constraint "quality_run_finding_severity_check"
          check (severity in ('critical', 'high', 'medium', 'low', 'info')),
        constraint "quality_run_finding_confidence_check"
          check (confidence in ('none', 'low', 'medium', 'high')),
        constraint "quality_run_finding_fixability_check"
          check (fixability in ('fixable_local', 'requires_retry', 'requires_user', 'unfixable'))
      );
    `);
    this.addSql(`create index "quality_run_finding_iteration_id_index" on "quality_run_finding" ("iteration_id");`);
    this.addSql(`create index "quality_run_finding_run_id_type_index" on "quality_run_finding" ("run_id", "type");`);
    this.addSql(`create index "quality_run_finding_run_id_severity_index" on "quality_run_finding" ("run_id", "severity");`);
    this.addSql(`
      alter table "quality_run_finding"
        add constraint "quality_run_finding_iteration_id_foreign"
        foreign key ("iteration_id") references "quality_run_iteration" ("id")
        on delete cascade;
    `);
    this.addSql(`
      alter table "quality_run_finding"
        add constraint "quality_run_finding_run_id_foreign"
        foreign key ("run_id") references "quality_run" ("id")
        on delete cascade;
    `);

    this.addSql(`
      create table "quality_run_criterion_result" (
        "id"            uuid        not null,
        "iteration_id"  uuid        not null,
        "run_id"        varchar(80) not null,
        "position"      int         not null,
        "criterion_id"  varchar(20) not null,
        "kind"          varchar(60) not null,
        "result"        text        not null,
        "hits"          int         not null,
        "confidence"    text        null,
        "location_refs" text[]      not null,
        constraint "quality_run_criterion_result_pkey" primary key ("id"),
        constraint "quality_run_criterion_result_result_check"
          check (result in ('pass', 'partial', 'fail', 'not_applicable', 'unassessed')),
        constraint "quality_run_criterion_result_confidence_check"
          check (confidence is null or confidence in ('none', 'low', 'medium', 'high'))
      );
    `);
    this.addSql(`create index "quality_run_criterion_result_run_id_index" on "quality_run_criterion_result" ("run_id");`);
    this.addSql(`
      alter table "quality_run_criterion_result"
        add constraint "quality_run_criterion_result_iteration_id_criterion_id_unique" unique ("iteration_id", "criterion_id");
    `);
    this.addSql(`
      alter table "quality_run_criterion_result"
        add constraint "quality_run_criterion_result_iteration_id_foreign"
        foreign key ("iteration_id") references "quality_run_iteration" ("id")
        on delete cascade;
    `);
    this.addSql(`
      alter table "quality_run_criterion_result"
        add constraint "quality_run_criterion_result_run_id_foreign"
        foreign key ("run_id") references "quality_run" ("id")
        on delete cascade;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "quality_run_criterion_result" cascade;`);
    this.addSql(`drop table if exists "quality_run_finding" cascade;`);
    this.addSql(`drop table if exists "quality_run_iteration" cascade;`);
    this.addSql(`drop table if exists "quality_run_criterion" cascade;`);
    this.addSql(`drop table if exists "quality_run" cascade;`);
  }
}
