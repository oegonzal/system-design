import { Migration } from '@mikro-orm/migrations';

/**
 * The job-application service's record: one row per application for one
 * subject, keyed by the session's unit id for a session-sourced row and minted
 * for a hand-entered one, with the company's identity key beside its spelling
 * so two spellings of one company meet.
 */
export class Migration20261011100003_job_application extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "job_application" (
        "id"            uuid          not null,
        "subject"       text          not null,
        "company"       text          not null,
        "identity_key"  text          not null,
        "label"         text          not null,
        "url"           text          null,
        "source"        varchar(20)   not null,
        "session_id"    varchar(80)   null,
        "profile"       text          null,
        "unit_ordinal"  integer       null,
        "status"        varchar(20)   not null,
        "opened_at"     timestamptz   not null,
        "closed_at"     timestamptz   null,
        "expires_at"    timestamptz   null,
        constraint "job_application_pkey" primary key ("id"),
        constraint "job_application_status_check" check (status in ('in-progress', 'submitted', 'submitted-before', 'skipped', 'failed', 'abandoned')),
        constraint "job_application_source_check" check (source in ('session', 'manual'))
      );
    `);
    this.addSql(
      `create index "job_application_subject_identity_key_index" on "job_application" ("subject", "identity_key");`,
    );
    this.addSql(`create index "job_application_status_index" on "job_application" ("status");`);
    this.addSql(`create index "job_application_opened_at_index" on "job_application" ("opened_at");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "job_application" cascade;`);
  }
}
