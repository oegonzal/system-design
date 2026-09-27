import { Migration } from '@mikro-orm/migrations';

/**
 * The govcon package's two tables. `govcon_opportunity` is the normalized
 * SAM.gov feed keyed by the source's notice id (a re-pull upserts, never
 * duplicates); `govcon_source_call` records every upstream request and doubles
 * as the short-lived cache and the daily-budget ledger. Codes get headroom over
 * their documented widths and free text is `text`, so an odd upstream value
 * cannot fail a batch.
 */
export class Migration20260926100001_create_govcon extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "govcon_opportunity" (
        "notice_id"             varchar(80)  not null,
        "title"                 text         not null,
        "solicitation_number"   text         null,
        "agency_path"           text         null,
        "agency_code"           text         null,
        "posted_at"             timestamptz  not null,
        "response_deadline_at"  timestamptz  null,
        "archive_at"            timestamptz  null,
        "archive_type"          text         null,
        "notice_type"           text         null,
        "base_type"             text         null,
        "active"                boolean      null,
        "naics_code"            varchar(16)  null,
        "naics_codes"           jsonb        not null,
        "classification_code"   varchar(16)  null,
        "set_aside_code"        varchar(32)  null,
        "set_aside_description" text         null,
        "organization_type"     text         null,
        "place_of_performance"  jsonb        null,
        "office_address"        jsonb        null,
        "points_of_contact"     jsonb        not null,
        "description_url"       text         null,
        "ui_link"               text         null,
        "additional_info_link"  text         null,
        "resource_links"        jsonb        not null,
        "award"                 jsonb        null,
        "raw"                   jsonb        not null,
        "source"                varchar(40)  not null,
        "first_seen_at"         timestamptz  not null,
        "last_seen_at"          timestamptz  not null,
        constraint "govcon_opportunity_pkey" primary key ("notice_id")
      );
    `);
    this.addSql(
      `create index "govcon_opportunity_posted_at_index" on "govcon_opportunity" ("posted_at");`,
    );
    this.addSql(
      `create index "govcon_opportunity_naics_code_index" on "govcon_opportunity" ("naics_code");`,
    );
    this.addSql(
      `create index "govcon_opportunity_set_aside_code_index" on "govcon_opportunity" ("set_aside_code");`,
    );
    this.addSql(
      `create index "govcon_opportunity_response_deadline_at_index" on "govcon_opportunity" ("response_deadline_at");`,
    );

    this.addSql(`
      create table "govcon_source_call" (
        "id"             uuid         not null,
        "source"         varchar(40)  not null,
        "query_key"      varchar(64)  not null,
        "query"          jsonb        not null,
        "requested_at"   timestamptz  not null,
        "duration_ms"    int          not null,
        "status"         int          null,
        "outcome"        text         not null,
        "total_records"  int          null,
        "record_count"   int          null,
        "error"          text         null,
        constraint "govcon_source_call_pkey" primary key ("id"),
        constraint "govcon_source_call_outcome_check"
          check (outcome in ('ok', 'error', 'rate-limited', 'invalid-response'))
      );
    `);
    this.addSql(
      `create index "govcon_source_call_source_query_key_requested_at_index" on "govcon_source_call" ("source", "query_key", "requested_at");`,
    );
    this.addSql(
      `create index "govcon_source_call_source_requested_at_index" on "govcon_source_call" ("source", "requested_at");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "govcon_source_call" cascade;`);
    this.addSql(`drop table if exists "govcon_opportunity" cascade;`);
  }
}
