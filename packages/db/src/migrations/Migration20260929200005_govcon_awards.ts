import { Migration } from '@mikro-orm/migrations';

/**
 * Contract awards from SAM.gov's Contract Awards API and from USAspending,
 * normalized to one shape and keyed by the source and its own id. What the
 * government paid, to whom and after how many offers — the intel a bid is
 * priced against, and the scorer's history factor.
 */
export class Migration20260929200005_govcon_awards extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "govcon_award" (
        "source"                varchar(20)    not null,
        "external_id"           varchar(160)   not null,
        "solicitation_number"   text           null,
        "naics_code"            varchar(16)    null,
        "psc_code"              varchar(16)    null,
        "agency_path"           text           null,
        "agency_code"           text           null,
        "awardee_name"          text           null,
        "awardee_uei"           varchar(12)    null,
        "amount"                numeric(16,2)  null,
        "offers_received"       int            null,
        "extent_competed"       varchar(16)    null,
        "set_aside_code"        varchar(32)    null,
        "signed_at"             date           not null,
        "completion_at"         date           null,
        "place_of_performance"  jsonb          null,
        "fetched_at"            timestamptz    not null,
        constraint "govcon_award_pkey" primary key ("source", "external_id"),
        constraint "govcon_award_source_check" check (source in ('sam.gov', 'usaspending'))
      );
    `);
    this.addSql(
      `create index "govcon_award_naics_index" on "govcon_award" ("naics_code", "signed_at");`,
    );
    this.addSql(
      `create index "govcon_award_solicitation_number_index" on "govcon_award" ("solicitation_number");`,
    );
    this.addSql(`create index "govcon_award_awardee_uei_index" on "govcon_award" ("awardee_uei");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "govcon_award" cascade;`);
  }
}
