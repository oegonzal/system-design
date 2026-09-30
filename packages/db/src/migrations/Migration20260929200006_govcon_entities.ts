import { Migration } from '@mikro-orm/migrations';

/** SAM.gov registrants, keyed by unique entity id, refreshed on every lookup. */
export class Migration20260929200006_govcon_entities extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "govcon_entity" (
        "uei"                      varchar(12)  not null,
        "cage"                     varchar(16)  null,
        "legal_name"               text         not null,
        "registration_status"      text         null,
        "registration_expires_at"  date         null,
        "business_types"           jsonb        not null,
        "sba_certifications"       jsonb        not null,
        "naics"                    jsonb        not null,
        "psc"                      jsonb        not null,
        "excluded"                 boolean      not null,
        "fetched_at"               timestamptz  not null,
        constraint "govcon_entity_pkey" primary key ("uei")
      );
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "govcon_entity" cascade;`);
  }
}
