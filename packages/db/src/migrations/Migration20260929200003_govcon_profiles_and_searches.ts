import { Migration } from '@mikro-orm/migrations';

/**
 * Profiles and saved searches leave the code and become rows. A profile is
 * one validated document keyed by its slug, at most one of them the default
 * (a partial unique index). A saved search is one query filter a profile
 * keeps by name; the ones flagged `included_in_pull` are, in `pull_order`,
 * the slices of that profile's daily pull — so a slice is declared in one
 * place. Deleting a profile deletes its searches.
 */
export class Migration20260929200003_govcon_profiles_and_searches extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "govcon_search_profile" (
        "id"          varchar(40)  not null,
        "company"     text         not null,
        "document"    jsonb        not null,
        "is_default"  boolean      not null,
        "created_at"  timestamptz  not null,
        "updated_at"  timestamptz  not null,
        constraint "govcon_search_profile_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `create unique index "govcon_search_profile_default_index" on "govcon_search_profile" ("is_default") where is_default;`,
    );
    this.addSql(`
      create table "govcon_saved_search" (
        "id"                uuid          not null,
        "profile_id"        varchar(40)   not null,
        "name"              varchar(120)  not null,
        "filter"            jsonb         not null,
        "days"              int           not null,
        "included_in_pull"  boolean       not null,
        "pull_order"        int           not null,
        "last_run_at"       timestamptz   null,
        "created_at"        timestamptz   not null,
        "updated_at"        timestamptz   not null,
        constraint "govcon_saved_search_pkey" primary key ("id"),
        constraint "govcon_saved_search_profile_id_name_unique" unique ("profile_id", "name")
      );
    `);
    this.addSql(`
      alter table "govcon_saved_search"
        add constraint "govcon_saved_search_profile_id_foreign"
        foreign key ("profile_id") references "govcon_search_profile" ("id")
        on delete cascade;
    `);
    this.addSql(
      `create index "govcon_saved_search_pull_index" on "govcon_saved_search" ("profile_id", "included_in_pull", "pull_order");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "govcon_saved_search" cascade;`);
    this.addSql(`drop table if exists "govcon_search_profile" cascade;`);
  }
}
