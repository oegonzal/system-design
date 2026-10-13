import { Migration } from '@mikro-orm/migrations';

/**
 * Saved views: an address inside the client that a profile keeps by name.
 * A page there is its address, so the row holds the address and nothing of
 * what it shows; one name per profile, gone with the profile.
 */
export class Migration20261014100007_govcon_saved_view extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "govcon_saved_view" (
        "id"          uuid          not null,
        "profile_id"  varchar(40)   not null,
        "name"        varchar(120)  not null,
        "href"        text          not null,
        "created_at"  timestamptz   not null,
        "updated_at"  timestamptz   not null,
        constraint "govcon_saved_view_pkey" primary key ("id"),
        constraint "govcon_saved_view_profile_id_name_unique" unique ("profile_id", "name")
      );
    `);
    this.addSql(`
      alter table "govcon_saved_view"
        add constraint "govcon_saved_view_profile_id_foreign"
        foreign key ("profile_id") references "govcon_search_profile" ("id")
        on delete cascade;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "govcon_saved_view" cascade;`);
  }
}
