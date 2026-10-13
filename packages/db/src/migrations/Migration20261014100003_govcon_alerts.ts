import { Migration } from '@mikro-orm/migrations';

/**
 * The spending warm's alert ledger: one row per alert raised, keyed by what
 * makes it the same alert tomorrow (kind, subject, the scope's hash), with
 * the bus's receipt and the digest prompt it was listed in. Written only for
 * what was published, so a warm that could not reach the bus raises the same
 * alerts again next time.
 */
export class Migration20261014100003_govcon_alerts extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "govcon_alert" (
        "id"          uuid         not null,
        "kind"        varchar(32)  not null,
        "subject"     text         not null,
        "scope_key"   varchar(64)  not null,
        "profile_id"  varchar(40)  not null,
        "raised_at"   timestamptz  not null,
        "event_seq"   text         not null,
        "prompt_id"   uuid         null,
        constraint "govcon_alert_pkey" primary key ("id"),
        constraint "govcon_alert_kind_check" check (kind in ('award-ending', 'pulse-above-band')),
        constraint "govcon_alert_kind_subject_scope_key_unique" unique ("kind", "subject", "scope_key")
      );
    `);
    this.addSql(`create index "govcon_alert_raised_at_index" on "govcon_alert" ("raised_at");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "govcon_alert" cascade;`);
  }
}
